import type { RouterOutputs } from "@cossistant/api/types";

type PlanInfo = RouterOutputs["plan"]["getPlanInfo"];
type Plan = PlanInfo["plan"];
type SelfHostedPlan = Extract<Plan, { name: "self_hosted" }>;

export function isSelfHostedPlan(
	plan: Plan | null | undefined
): plan is SelfHostedPlan {
	return plan?.name === "self_hosted";
}

export function isBillingEnabled(
	planInfo: Pick<PlanInfo, "billing"> | null | undefined
): boolean {
	return planInfo?.billing.enabled === true;
}

export function canManageBilling(
	planInfo: Pick<PlanInfo, "billing"> | null | undefined
): boolean {
	return planInfo?.billing.canManageSubscription === true;
}
