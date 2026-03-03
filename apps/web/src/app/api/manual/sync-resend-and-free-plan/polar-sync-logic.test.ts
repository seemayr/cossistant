import { describe, expect, it } from "bun:test";
import {
	decideWebsiteAction,
	executeWebsiteAction,
	processOrganizationWebsites,
} from "./polar-sync-logic";

const FREE_PRODUCT_ID = "prod_free";
const PAID_PRODUCT_IDS = new Set(["prod_hobby", "prod_pro"]);

function buildSubscription(input: {
	id: string;
	productId: string;
	status?: string;
	createdAt?: string;
	currentPeriodStart?: string;
}) {
	return {
		id: input.id,
		productId: input.productId,
		status: input.status ?? "active",
		createdAt: input.createdAt,
		currentPeriodStart: input.currentPeriodStart,
	};
}

describe("decideWebsiteAction", () => {
	it("creates free when no subscriptions exist", () => {
		const decision = decideWebsiteAction({
			subscriptions: [],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
		});

		expect(decision).toEqual({
			kind: "create_free",
		});
	});

	it("skips when exactly one free subscription exists", () => {
		const decision = decideWebsiteAction({
			subscriptions: [
				buildSubscription({
					id: "sub_free",
					productId: FREE_PRODUCT_ID,
				}),
			],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
		});

		expect(decision).toEqual({
			kind: "skip_single_free",
			freeSubscriptionId: "sub_free",
		});
	});

	it("skips when a single paid subscription exists", () => {
		const decision = decideWebsiteAction({
			subscriptions: [
				buildSubscription({
					id: "sub_paid",
					productId: "prod_hobby",
				}),
			],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
		});

		expect(decision).toEqual({
			kind: "skip_paid",
			paidSubscriptionId: "sub_paid",
		});
	});

	it("revokes free when paid and free coexist", () => {
		const decision = decideWebsiteAction({
			subscriptions: [
				buildSubscription({
					id: "sub_free_1",
					productId: FREE_PRODUCT_ID,
				}),
				buildSubscription({
					id: "sub_free_2",
					productId: FREE_PRODUCT_ID,
				}),
				buildSubscription({
					id: "sub_paid",
					productId: "prod_pro",
				}),
			],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
		});

		expect(decision).toEqual({
			kind: "revoke_free_under_paid",
			paidSubscriptionId: "sub_paid",
			revokeSubscriptionIds: ["sub_free_1", "sub_free_2"],
		});
	});

	it("keeps one free deterministically and revokes duplicates", () => {
		const decision = decideWebsiteAction({
			subscriptions: [
				buildSubscription({
					id: "sub-c",
					productId: FREE_PRODUCT_ID,
					status: "trialing",
					currentPeriodStart: "2026-01-01T00:00:00.000Z",
					createdAt: "2026-01-01T00:00:00.000Z",
				}),
				buildSubscription({
					id: "sub-b",
					productId: FREE_PRODUCT_ID,
					status: "active",
					currentPeriodStart: "2025-01-01T00:00:00.000Z",
					createdAt: "2025-01-05T00:00:00.000Z",
				}),
				buildSubscription({
					id: "sub-a",
					productId: FREE_PRODUCT_ID,
					status: "active",
					currentPeriodStart: "2025-01-01T00:00:00.000Z",
					createdAt: "2025-01-05T00:00:00.000Z",
				}),
			],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
		});

		expect(decision).toEqual({
			kind: "revoke_duplicate_free",
			keepSubscriptionId: "sub-a",
			revokeSubscriptionIds: ["sub-b", "sub-c"],
		});
	});

	it("reports anomaly when multiple paid subscriptions exist", () => {
		const decision = decideWebsiteAction({
			subscriptions: [
				buildSubscription({
					id: "sub_paid_1",
					productId: "prod_hobby",
				}),
				buildSubscription({
					id: "sub_paid_2",
					productId: "prod_pro",
				}),
				buildSubscription({
					id: "sub_free",
					productId: FREE_PRODUCT_ID,
				}),
			],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
		});

		expect(decision).toEqual({
			kind: "anomaly_multiple_paid",
			freeSubscriptionIds: ["sub_free"],
			paidSubscriptionIds: ["sub_paid_1", "sub_paid_2"],
		});
	});

	it("reports anomaly when unknown products are present", () => {
		const decision = decideWebsiteAction({
			subscriptions: [
				buildSubscription({
					id: "sub_unknown",
					productId: "prod_enterprise",
				}),
				buildSubscription({
					id: "sub_paid",
					productId: "prod_hobby",
				}),
			],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
		});

		expect(decision).toEqual({
			kind: "anomaly_unknown_products",
			freeSubscriptionIds: [],
			paidSubscriptionIds: ["sub_paid"],
			unknownSubscriptionIds: ["sub_unknown"],
		});
	});
});

describe("executeWebsiteAction", () => {
	it("does not mutate in dry-run mode", async () => {
		const createCalls: Array<{
			customerId: string;
			productId: string;
			websiteId: string;
		}> = [];
		const revokeCalls: string[] = [];

		const result = await executeWebsiteAction({
			mode: "dry-run",
			organizationId: "org_1",
			customerId: "cus_1",
			website: {
				id: "site_1",
				slug: "site-1",
			},
			subscriptions: [],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
			createFreeSubscription: async (input) => {
				createCalls.push(input);
				return { id: "sub_created" };
			},
			revokeSubscription: async (subscriptionId) => {
				revokeCalls.push(subscriptionId);
			},
		});

		expect(createCalls).toHaveLength(0);
		expect(revokeCalls).toHaveLength(0);
		expect(result.actions.wouldCreate).toHaveLength(1);
		expect(result.actions.created).toHaveLength(0);
		expect(result.counters.createdFree).toBe(1);
	});

	it("creates and records free subscriptions in apply mode", async () => {
		const createCalls: Array<{
			customerId: string;
			productId: string;
			websiteId: string;
		}> = [];

		const result = await executeWebsiteAction({
			mode: "apply",
			organizationId: "org_1",
			customerId: "cus_1",
			website: {
				id: "site_1",
				slug: "site-1",
			},
			subscriptions: [],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
			createFreeSubscription: async (input) => {
				createCalls.push(input);
				return { id: "sub_created" };
			},
			revokeSubscription: async () => {},
		});

		expect(createCalls).toEqual([
			{
				customerId: "cus_1",
				productId: FREE_PRODUCT_ID,
				websiteId: "site_1",
			},
		]);
		expect(result.actions.created).toHaveLength(1);
		expect(result.actions.created[0]?.subscriptionId).toBe("sub_created");
		expect(result.counters.createdFree).toBe(1);
	});

	it("revokes free duplicates in apply mode", async () => {
		const revokedIds: string[] = [];

		const result = await executeWebsiteAction({
			mode: "apply",
			organizationId: "org_1",
			customerId: "cus_1",
			website: {
				id: "site_1",
				slug: "site-1",
			},
			subscriptions: [
				buildSubscription({
					id: "sub_keep",
					productId: FREE_PRODUCT_ID,
					currentPeriodStart: "2025-02-01T00:00:00.000Z",
					createdAt: "2025-02-01T00:00:00.000Z",
				}),
				buildSubscription({
					id: "sub_revoke_1",
					productId: FREE_PRODUCT_ID,
					currentPeriodStart: "2024-02-01T00:00:00.000Z",
					createdAt: "2024-02-01T00:00:00.000Z",
				}),
				buildSubscription({
					id: "sub_revoke_2",
					productId: FREE_PRODUCT_ID,
					currentPeriodStart: "2023-02-01T00:00:00.000Z",
					createdAt: "2023-02-01T00:00:00.000Z",
				}),
			],
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
			createFreeSubscription: async () => ({ id: "unused" }),
			revokeSubscription: async (subscriptionId) => {
				revokedIds.push(subscriptionId);
			},
		});

		expect(revokedIds).toEqual(["sub_revoke_1", "sub_revoke_2"]);
		expect(result.actions.revoked).toHaveLength(1);
		expect(result.actions.revoked[0]?.subscriptionIds).toEqual([
			"sub_revoke_1",
			"sub_revoke_2",
		]);
		expect(result.counters.revokedFreeDuplicates).toBe(2);
	});
});

describe("processOrganizationWebsites", () => {
	it("reports missing customer and does not process website mutations", async () => {
		const result = await processOrganizationWebsites({
			mode: "dry-run",
			organizationId: "org_1",
			customerId: null,
			websites: [
				{
					id: "site_1",
					slug: "site-1",
				},
				{
					id: "site_2",
					slug: "site-2",
				},
			],
			subscriptionsByWebsiteId: new Map(),
			freeProductId: FREE_PRODUCT_ID,
			paidProductIds: PAID_PRODUCT_IDS,
			createFreeSubscription: async () => ({ id: "unused" }),
			revokeSubscription: async () => {},
		});

		expect(result.missingCustomer).toEqual({
			organizationId: "org_1",
			websites: [
				{
					id: "site_1",
					slug: "site-1",
				},
				{
					id: "site_2",
					slug: "site-2",
				},
			],
		});
		expect(result.actions.wouldCreate).toHaveLength(0);
		expect(result.actions.wouldRevoke).toHaveLength(0);
		expect(result.counters.failures).toBe(0);
	});
});
