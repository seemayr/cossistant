import { env } from "@api/env";

export type BillingProvider = "polar" | "disabled";

export type BillingStatus = {
	enabled: boolean;
	provider: BillingProvider;
	canManageSubscription: boolean;
};

export function isPolarEnabled(): boolean {
	return env.POLAR_ENABLED !== false;
}

export function getBillingProvider(): BillingProvider {
	return isPolarEnabled() ? "polar" : "disabled";
}

export function getBillingStatus(): BillingStatus {
	const enabled = isPolarEnabled();

	return {
		enabled,
		provider: enabled ? "polar" : "disabled",
		canManageSubscription: enabled,
	};
}
