/* TEMPORARY ONE-OFF ENDPOINT. DELETE AFTER USE. */
import { db, isNull } from "@api/db";
import { website } from "@api/db/schema";
import { getPlanConfig } from "@api/lib/plans/config";
import { getCustomerByOrganizationId } from "@api/lib/plans/polar";
import polarClient from "@api/lib/polar";
import { type NextRequest, NextResponse } from "next/server";
import {
	createEmptyOperationCounters,
	createEmptySyncActions,
	type MissingCustomerRecord,
	mergeOperationCounters,
	type PolarSyncAnomaly,
	type PolarSyncFailure,
	type PolarSyncSubscription,
	type PolarSyncWebsite,
	processOrganizationWebsites,
	type RunMode,
} from "./polar-sync-logic";

export const runtime = "nodejs";
export const maxDuration = 800;

type RouteFailure =
	| {
			kind: "website";
			organizationId: null;
			websiteId: string;
			websiteSlug: string;
			reason: "missing_organization_id";
			message: string;
	  }
	| {
			kind: "organization";
			organizationId: string;
			reason: "subscriptions_list_failed";
			message: string;
			websiteIds: string[];
			websiteSlugs: string[];
	  }
	| ({
			kind: "website";
	  } & PolarSyncFailure);

function stringifyError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	if (typeof value === "string") {
		return value;
	}

	return value.toISOString();
}

function parseBooleanFlag(value: unknown): boolean {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "number") {
		return value === 1;
	}

	if (typeof value !== "string") {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getWebsiteIdFromMetadata(metadata: unknown): string | null {
	if (!(metadata && typeof metadata === "object")) {
		return null;
	}

	const record = metadata as Record<string, unknown>;
	const websiteId = record.websiteId;
	if (typeof websiteId === "string") {
		return websiteId;
	}

	if (typeof websiteId === "number") {
		return String(websiteId);
	}

	return null;
}

async function resolveMode(request: NextRequest): Promise<RunMode> {
	if (parseBooleanFlag(request.nextUrl.searchParams.get("apply"))) {
		return "apply";
	}

	if (request.method !== "POST") {
		return "dry-run";
	}

	try {
		const body = await request.json();
		if (body && typeof body === "object") {
			const applyValue = (body as { apply?: unknown }).apply;
			if (parseBooleanFlag(applyValue)) {
				return "apply";
			}
		}
	} catch {
		// Ignore invalid/empty body and stay in dry-run mode.
	}

	return "dry-run";
}

function getBillingProductIds(): {
	freeProductId: string;
	paidProductIds: Set<string>;
} {
	const freeProductId = getPlanConfig("free").polarProductId?.trim() ?? "";
	if (!freeProductId) {
		throw new Error(
			"Free plan product ID is not configured. Set POLAR_PRODUCT_ID_FREE_SANDBOX/POLAR_PRODUCT_ID_FREE_PRODUCTION."
		);
	}

	const paidProductIds = new Set(
		[
			getPlanConfig("hobby").polarProductId?.trim() ?? "",
			getPlanConfig("pro").polarProductId?.trim() ?? "",
		].filter((productId) => productId.length > 0 && productId !== freeProductId)
	);

	return {
		freeProductId,
		paidProductIds,
	};
}

async function listActiveSubscriptionsByWebsite(params: {
	customerId: string;
}): Promise<Map<string, PolarSyncSubscription[]>> {
	const subscriptionsByWebsiteId = new Map<string, PolarSyncSubscription[]>();
	const pages = await polarClient.subscriptions.list({
		customerId: params.customerId,
		active: true,
		limit: 100,
	});

	for await (const page of pages) {
		for (const subscription of page.result.items) {
			const websiteId = getWebsiteIdFromMetadata(subscription.metadata);
			if (!websiteId) {
				continue;
			}

			const current = subscriptionsByWebsiteId.get(websiteId) ?? [];
			current.push({
				id: subscription.id,
				productId: subscription.productId,
				status: subscription.status,
				createdAt: toIso(subscription.createdAt),
				currentPeriodStart: toIso(subscription.currentPeriodStart),
			});
			subscriptionsByWebsiteId.set(websiteId, current);
		}
	}

	return subscriptionsByWebsiteId;
}

async function runSync(mode: RunMode) {
	const startedAt = new Date();
	const startedAtMs = Date.now();
	const { freeProductId, paidProductIds } = getBillingProductIds();

	const activeWebsites = await db
		.select({
			id: website.id,
			slug: website.slug,
			organizationId: website.organizationId,
		})
		.from(website)
		.where(isNull(website.deletedAt));

	let counters = createEmptyOperationCounters();
	const actions = createEmptySyncActions();
	const anomalies: PolarSyncAnomaly[] = [];
	const failures: RouteFailure[] = [];
	const missingCustomers: MissingCustomerRecord[] = [];
	const websitesByOrganization = new Map<string, PolarSyncWebsite[]>();

	for (const activeWebsite of activeWebsites) {
		const organizationId = activeWebsite.organizationId?.trim() ?? "";

		if (!organizationId) {
			counters.failures += 1;
			failures.push({
				kind: "website",
				organizationId: null,
				websiteId: activeWebsite.id,
				websiteSlug: activeWebsite.slug,
				reason: "missing_organization_id",
				message: "Website has no organizationId.",
			});
			continue;
		}

		const organizationWebsites =
			websitesByOrganization.get(organizationId) ?? [];
		organizationWebsites.push({
			id: activeWebsite.id,
			slug: activeWebsite.slug,
		});
		websitesByOrganization.set(organizationId, organizationWebsites);
	}

	let missingCustomerOrganizations = 0;

	for (const [organizationId, organizationWebsites] of websitesByOrganization) {
		const customer = await getCustomerByOrganizationId(organizationId);

		if (!customer) {
			const organizationResult = await processOrganizationWebsites({
				mode,
				organizationId,
				customerId: null,
				websites: organizationWebsites,
				subscriptionsByWebsiteId: new Map(),
				freeProductId,
				paidProductIds,
				createFreeSubscription: async () => ({ id: "" }),
				revokeSubscription: async () => {},
			});

			if (organizationResult.missingCustomer) {
				missingCustomerOrganizations += 1;
				missingCustomers.push(organizationResult.missingCustomer);
			}
			continue;
		}

		let subscriptionsByWebsiteId: Map<string, PolarSyncSubscription[]>;
		try {
			subscriptionsByWebsiteId = await listActiveSubscriptionsByWebsite({
				customerId: customer.id,
			});
		} catch (error) {
			counters.failures += 1;
			failures.push({
				kind: "organization",
				organizationId,
				reason: "subscriptions_list_failed",
				message: stringifyError(error),
				websiteIds: organizationWebsites.map((entry) => entry.id),
				websiteSlugs: organizationWebsites.map((entry) => entry.slug),
			});
			continue;
		}

		const organizationResult = await processOrganizationWebsites({
			mode,
			organizationId,
			customerId: customer.id,
			websites: organizationWebsites,
			subscriptionsByWebsiteId,
			freeProductId,
			paidProductIds,
			createFreeSubscription: async (input) => {
				const created = await polarClient.subscriptions.create({
					customerId: input.customerId,
					productId: input.productId,
					metadata: {
						websiteId: input.websiteId,
					},
				});

				return { id: created.id };
			},
			revokeSubscription: async (subscriptionId) => {
				await polarClient.subscriptions.revoke({
					id: subscriptionId,
				});
			},
		});

		counters = mergeOperationCounters(counters, organizationResult.counters);
		actions.wouldCreate.push(...organizationResult.actions.wouldCreate);
		actions.created.push(...organizationResult.actions.created);
		actions.wouldRevoke.push(...organizationResult.actions.wouldRevoke);
		actions.revoked.push(...organizationResult.actions.revoked);
		anomalies.push(...organizationResult.anomalies);
		failures.push(
			...organizationResult.failures.map(
				(failure): RouteFailure => ({
					kind: "website",
					...failure,
				})
			)
		);
	}

	const finishedAt = new Date();

	return {
		ok: counters.failures === 0,
		mode,
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
		durationMs: Date.now() - startedAtMs,
		counters: {
			organizationsScanned: websitesByOrganization.size,
			websitesScanned: activeWebsites.length,
			missingCustomerOrganizations,
			skippedPaid: counters.skippedPaid,
			skippedSingleFree: counters.skippedSingleFree,
			createdFree: counters.createdFree,
			revokedFreeDuplicates: counters.revokedFreeDuplicates,
			revokedFreeUnderPaid: counters.revokedFreeUnderPaid,
			anomalies: counters.anomalies,
			failures: counters.failures,
		},
		missingCustomers,
		actions,
		anomalies,
		failures,
	};
}

async function handleRequest(request: NextRequest) {
	try {
		const mode = await resolveMode(request);
		const result = await runSync(mode);

		return NextResponse.json(result, {
			status: 200,
			headers: {
				"Cache-Control": "no-store",
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				ok: false,
				error: stringifyError(error),
			},
			{
				status: 500,
				headers: {
					"Cache-Control": "no-store",
				},
			}
		);
	}
}

export async function GET(request: NextRequest) {
	return handleRequest(request);
}

export async function POST(request: NextRequest) {
	return handleRequest(request);
}
