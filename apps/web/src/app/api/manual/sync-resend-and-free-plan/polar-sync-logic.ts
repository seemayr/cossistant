export type RunMode = "dry-run" | "apply";

export type PolarSyncWebsite = {
	id: string;
	slug: string;
};

export type PolarSyncSubscription = {
	id: string;
	productId: string;
	status: string;
	createdAt?: string | null;
	currentPeriodStart?: string | null;
};

export type WebsiteActionDecision =
	| {
			kind: "anomaly_unknown_products";
			freeSubscriptionIds: string[];
			paidSubscriptionIds: string[];
			unknownSubscriptionIds: string[];
	  }
	| {
			kind: "anomaly_multiple_paid";
			freeSubscriptionIds: string[];
			paidSubscriptionIds: string[];
	  }
	| {
			kind: "skip_paid";
			paidSubscriptionId: string;
	  }
	| {
			kind: "skip_single_free";
			freeSubscriptionId: string;
	  }
	| {
			kind: "create_free";
	  }
	| {
			kind: "revoke_free_under_paid";
			paidSubscriptionId: string;
			revokeSubscriptionIds: string[];
	  }
	| {
			kind: "revoke_duplicate_free";
			keepSubscriptionId: string;
			revokeSubscriptionIds: string[];
	  };

export type OperationCounters = {
	skippedPaid: number;
	skippedSingleFree: number;
	createdFree: number;
	revokedFreeDuplicates: number;
	revokedFreeUnderPaid: number;
	anomalies: number;
	failures: number;
};

export type CreateAction = {
	organizationId: string;
	customerId: string;
	websiteId: string;
	websiteSlug: string;
	productId: string;
	subscriptionId?: string;
};

export type RevokeAction = {
	organizationId: string;
	customerId: string;
	websiteId: string;
	websiteSlug: string;
	reason: "free_under_paid" | "duplicate_free";
	subscriptionIds: string[];
};

export type SyncActions = {
	wouldCreate: CreateAction[];
	created: CreateAction[];
	wouldRevoke: RevokeAction[];
	revoked: RevokeAction[];
};

export type PolarSyncAnomaly = {
	organizationId: string;
	customerId: string;
	websiteId: string;
	websiteSlug: string;
	reason: "unknown_products" | "multiple_paid";
	freeSubscriptionIds: string[];
	paidSubscriptionIds: string[];
	unknownSubscriptionIds: string[];
};

export type PolarSyncFailure = {
	organizationId: string;
	customerId: string;
	websiteId: string;
	websiteSlug: string;
	reason: "create_free_failed" | "revoke_failed";
	message: string;
	subscriptionId?: string;
};

export type WebsiteExecutionResult = {
	decision: WebsiteActionDecision;
	counters: OperationCounters;
	actions: SyncActions;
	anomalies: PolarSyncAnomaly[];
	failures: PolarSyncFailure[];
};

export type MissingCustomerRecord = {
	organizationId: string;
	websites: PolarSyncWebsite[];
};

export type OrganizationSyncResult = {
	missingCustomer: MissingCustomerRecord | null;
	counters: OperationCounters;
	actions: SyncActions;
	anomalies: PolarSyncAnomaly[];
	failures: PolarSyncFailure[];
};

function toDateNumber(value: string | null | undefined): number {
	if (!value) {
		return 0;
	}

	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

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

function compareFreeSubscriptions(
	a: PolarSyncSubscription,
	b: PolarSyncSubscription
): number {
	const activeDiff =
		Number(b.status === "active") - Number(a.status === "active");
	if (activeDiff !== 0) {
		return activeDiff;
	}

	const periodDiff =
		toDateNumber(b.currentPeriodStart) - toDateNumber(a.currentPeriodStart);
	if (periodDiff !== 0) {
		return periodDiff;
	}

	const createdDiff = toDateNumber(b.createdAt) - toDateNumber(a.createdAt);
	if (createdDiff !== 0) {
		return createdDiff;
	}

	return a.id.localeCompare(b.id);
}

function sortIds(ids: string[]): string[] {
	return [...ids].sort((a, b) => a.localeCompare(b));
}

export function createEmptyOperationCounters(): OperationCounters {
	return {
		skippedPaid: 0,
		skippedSingleFree: 0,
		createdFree: 0,
		revokedFreeDuplicates: 0,
		revokedFreeUnderPaid: 0,
		anomalies: 0,
		failures: 0,
	};
}

export function mergeOperationCounters(
	current: OperationCounters,
	next: OperationCounters
): OperationCounters {
	return {
		skippedPaid: current.skippedPaid + next.skippedPaid,
		skippedSingleFree: current.skippedSingleFree + next.skippedSingleFree,
		createdFree: current.createdFree + next.createdFree,
		revokedFreeDuplicates:
			current.revokedFreeDuplicates + next.revokedFreeDuplicates,
		revokedFreeUnderPaid:
			current.revokedFreeUnderPaid + next.revokedFreeUnderPaid,
		anomalies: current.anomalies + next.anomalies,
		failures: current.failures + next.failures,
	};
}

export function createEmptySyncActions(): SyncActions {
	return {
		wouldCreate: [],
		created: [],
		wouldRevoke: [],
		revoked: [],
	};
}

export function decideWebsiteAction(params: {
	subscriptions: PolarSyncSubscription[];
	freeProductId: string;
	paidProductIds: Set<string>;
}): WebsiteActionDecision {
	const freeSubscriptions: PolarSyncSubscription[] = [];
	const paidSubscriptions: PolarSyncSubscription[] = [];
	const unknownSubscriptions: PolarSyncSubscription[] = [];

	for (const subscription of params.subscriptions) {
		if (subscription.productId === params.freeProductId) {
			freeSubscriptions.push(subscription);
			continue;
		}

		if (params.paidProductIds.has(subscription.productId)) {
			paidSubscriptions.push(subscription);
			continue;
		}

		unknownSubscriptions.push(subscription);
	}

	if (unknownSubscriptions.length > 0) {
		return {
			kind: "anomaly_unknown_products",
			freeSubscriptionIds: sortIds(freeSubscriptions.map((sub) => sub.id)),
			paidSubscriptionIds: sortIds(paidSubscriptions.map((sub) => sub.id)),
			unknownSubscriptionIds: sortIds(
				unknownSubscriptions.map((sub) => sub.id)
			),
		};
	}

	if (paidSubscriptions.length > 1) {
		return {
			kind: "anomaly_multiple_paid",
			freeSubscriptionIds: sortIds(freeSubscriptions.map((sub) => sub.id)),
			paidSubscriptionIds: sortIds(paidSubscriptions.map((sub) => sub.id)),
		};
	}

	if (paidSubscriptions.length === 1) {
		const paidSubscriptionId = paidSubscriptions[0]?.id;
		if (!paidSubscriptionId) {
			return {
				kind: "create_free",
			};
		}

		if (freeSubscriptions.length > 0) {
			return {
				kind: "revoke_free_under_paid",
				paidSubscriptionId,
				revokeSubscriptionIds: sortIds(freeSubscriptions.map((sub) => sub.id)),
			};
		}

		return {
			kind: "skip_paid",
			paidSubscriptionId,
		};
	}

	if (freeSubscriptions.length === 0) {
		return {
			kind: "create_free",
		};
	}

	if (freeSubscriptions.length === 1) {
		const freeSubscriptionId = freeSubscriptions[0]?.id;
		if (!freeSubscriptionId) {
			return {
				kind: "create_free",
			};
		}

		return {
			kind: "skip_single_free",
			freeSubscriptionId,
		};
	}

	const rankedFree = [...freeSubscriptions].sort(compareFreeSubscriptions);
	const keepSubscriptionId = rankedFree[0]?.id;

	if (!keepSubscriptionId) {
		return {
			kind: "create_free",
		};
	}

	return {
		kind: "revoke_duplicate_free",
		keepSubscriptionId,
		revokeSubscriptionIds: sortIds(
			rankedFree
				.filter((subscription) => subscription.id !== keepSubscriptionId)
				.map((subscription) => subscription.id)
		),
	};
}

async function revokeSubscriptions(params: {
	decision: Extract<
		WebsiteActionDecision,
		{ kind: "revoke_free_under_paid" | "revoke_duplicate_free" }
	>;
	mode: RunMode;
	organizationId: string;
	customerId: string;
	website: PolarSyncWebsite;
	revokeSubscription: (subscriptionId: string) => Promise<void>;
}): Promise<{
	counters: OperationCounters;
	actions: SyncActions;
	failures: PolarSyncFailure[];
}> {
	const counters = createEmptyOperationCounters();
	const actions = createEmptySyncActions();
	const failures: PolarSyncFailure[] = [];
	const revokeReason =
		params.decision.kind === "revoke_free_under_paid"
			? "free_under_paid"
			: "duplicate_free";
	const countKey =
		params.decision.kind === "revoke_free_under_paid"
			? "revokedFreeUnderPaid"
			: "revokedFreeDuplicates";

	if (params.decision.revokeSubscriptionIds.length === 0) {
		return {
			counters,
			actions,
			failures,
		};
	}

	if (params.mode === "dry-run") {
		counters[countKey] += params.decision.revokeSubscriptionIds.length;
		actions.wouldRevoke.push({
			organizationId: params.organizationId,
			customerId: params.customerId,
			websiteId: params.website.id,
			websiteSlug: params.website.slug,
			reason: revokeReason,
			subscriptionIds: [...params.decision.revokeSubscriptionIds],
		});
		return {
			counters,
			actions,
			failures,
		};
	}

	const revokedIds: string[] = [];
	for (const subscriptionId of params.decision.revokeSubscriptionIds) {
		try {
			await params.revokeSubscription(subscriptionId);
			counters[countKey] += 1;
			revokedIds.push(subscriptionId);
		} catch (error) {
			counters.failures += 1;
			failures.push({
				organizationId: params.organizationId,
				customerId: params.customerId,
				websiteId: params.website.id,
				websiteSlug: params.website.slug,
				reason: "revoke_failed",
				subscriptionId,
				message: stringifyError(error),
			});
		}
	}

	if (revokedIds.length > 0) {
		actions.revoked.push({
			organizationId: params.organizationId,
			customerId: params.customerId,
			websiteId: params.website.id,
			websiteSlug: params.website.slug,
			reason: revokeReason,
			subscriptionIds: revokedIds,
		});
	}

	return {
		counters,
		actions,
		failures,
	};
}

export async function executeWebsiteAction(params: {
	mode: RunMode;
	organizationId: string;
	customerId: string;
	website: PolarSyncWebsite;
	subscriptions: PolarSyncSubscription[];
	freeProductId: string;
	paidProductIds: Set<string>;
	createFreeSubscription: (input: {
		customerId: string;
		productId: string;
		websiteId: string;
	}) => Promise<{ id: string }>;
	revokeSubscription: (subscriptionId: string) => Promise<void>;
}): Promise<WebsiteExecutionResult> {
	const decision = decideWebsiteAction({
		subscriptions: params.subscriptions,
		freeProductId: params.freeProductId,
		paidProductIds: params.paidProductIds,
	});
	const counters = createEmptyOperationCounters();
	const actions = createEmptySyncActions();
	const anomalies: PolarSyncAnomaly[] = [];
	const failures: PolarSyncFailure[] = [];

	switch (decision.kind) {
		case "skip_paid": {
			counters.skippedPaid += 1;
			break;
		}
		case "skip_single_free": {
			counters.skippedSingleFree += 1;
			break;
		}
		case "anomaly_unknown_products": {
			counters.anomalies += 1;
			anomalies.push({
				organizationId: params.organizationId,
				customerId: params.customerId,
				websiteId: params.website.id,
				websiteSlug: params.website.slug,
				reason: "unknown_products",
				freeSubscriptionIds: decision.freeSubscriptionIds,
				paidSubscriptionIds: decision.paidSubscriptionIds,
				unknownSubscriptionIds: decision.unknownSubscriptionIds,
			});
			break;
		}
		case "anomaly_multiple_paid": {
			counters.anomalies += 1;
			anomalies.push({
				organizationId: params.organizationId,
				customerId: params.customerId,
				websiteId: params.website.id,
				websiteSlug: params.website.slug,
				reason: "multiple_paid",
				freeSubscriptionIds: decision.freeSubscriptionIds,
				paidSubscriptionIds: decision.paidSubscriptionIds,
				unknownSubscriptionIds: [],
			});
			break;
		}
		case "create_free": {
			const createAction: CreateAction = {
				organizationId: params.organizationId,
				customerId: params.customerId,
				websiteId: params.website.id,
				websiteSlug: params.website.slug,
				productId: params.freeProductId,
			};

			if (params.mode === "dry-run") {
				counters.createdFree += 1;
				actions.wouldCreate.push(createAction);
				break;
			}

			try {
				const created = await params.createFreeSubscription({
					customerId: params.customerId,
					productId: params.freeProductId,
					websiteId: params.website.id,
				});
				counters.createdFree += 1;
				actions.created.push({
					...createAction,
					subscriptionId: created.id,
				});
			} catch (error) {
				counters.failures += 1;
				failures.push({
					organizationId: params.organizationId,
					customerId: params.customerId,
					websiteId: params.website.id,
					websiteSlug: params.website.slug,
					reason: "create_free_failed",
					message: stringifyError(error),
				});
			}
			break;
		}
		case "revoke_free_under_paid":
		case "revoke_duplicate_free": {
			const revokeResult = await revokeSubscriptions({
				decision,
				mode: params.mode,
				organizationId: params.organizationId,
				customerId: params.customerId,
				website: params.website,
				revokeSubscription: params.revokeSubscription,
			});
			const mergedCounters = mergeOperationCounters(
				counters,
				revokeResult.counters
			);
			Object.assign(counters, mergedCounters);
			actions.wouldRevoke.push(...revokeResult.actions.wouldRevoke);
			actions.revoked.push(...revokeResult.actions.revoked);
			failures.push(...revokeResult.failures);
			break;
		}
		default: {
			const exhaustiveCheck: never = decision;
			throw new Error(`Unhandled website action decision: ${exhaustiveCheck}`);
		}
	}

	return {
		decision,
		counters,
		actions,
		anomalies,
		failures,
	};
}

export async function processOrganizationWebsites(params: {
	mode: RunMode;
	organizationId: string;
	customerId: string | null;
	websites: PolarSyncWebsite[];
	subscriptionsByWebsiteId: Map<string, PolarSyncSubscription[]>;
	freeProductId: string;
	paidProductIds: Set<string>;
	createFreeSubscription: (input: {
		customerId: string;
		productId: string;
		websiteId: string;
	}) => Promise<{ id: string }>;
	revokeSubscription: (subscriptionId: string) => Promise<void>;
}): Promise<OrganizationSyncResult> {
	if (!params.customerId) {
		return {
			missingCustomer: {
				organizationId: params.organizationId,
				websites: [...params.websites],
			},
			counters: createEmptyOperationCounters(),
			actions: createEmptySyncActions(),
			anomalies: [],
			failures: [],
		};
	}

	let counters = createEmptyOperationCounters();
	const actions = createEmptySyncActions();
	const anomalies: PolarSyncAnomaly[] = [];
	const failures: PolarSyncFailure[] = [];

	for (const website of params.websites) {
		const result = await executeWebsiteAction({
			mode: params.mode,
			organizationId: params.organizationId,
			customerId: params.customerId,
			website,
			subscriptions: params.subscriptionsByWebsiteId.get(website.id) ?? [],
			freeProductId: params.freeProductId,
			paidProductIds: params.paidProductIds,
			createFreeSubscription: params.createFreeSubscription,
			revokeSubscription: params.revokeSubscription,
		});

		counters = mergeOperationCounters(counters, result.counters);
		actions.wouldCreate.push(...result.actions.wouldCreate);
		actions.created.push(...result.actions.created);
		actions.wouldRevoke.push(...result.actions.wouldRevoke);
		actions.revoked.push(...result.actions.revoked);
		anomalies.push(...result.anomalies);
		failures.push(...result.failures);
	}

	return {
		missingCustomer: null,
		counters,
		actions,
		anomalies,
		failures,
	};
}
