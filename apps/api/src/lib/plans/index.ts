// Export public API for plan and feature checking
export {
	canUse,
	getPlanForWebsite,
	getSelfHostedPlanInfo,
	type PlanInfo,
	type ResolvedPlanName,
} from "./access";
export {
	FEATURE_CONFIG,
	type FeatureConfig,
	type FeatureKey,
	getDefaultPlan,
	getPlanConfig,
	mapPolarProductToPlan,
	PLAN_CONFIG,
	type PlanConfig,
	type PlanName,
} from "./config";
export {
	type CustomerState,
	getCustomerByOrganizationId,
	getCustomerByWebsiteId, // @deprecated Use getCustomerByOrganizationId instead
	getCustomerState,
	getCustomerStateByOrganizationId,
	getCustomerStateByWebsiteId, // @deprecated Use getCustomerStateByOrganizationId instead
	getPlanFromCustomerState,
	getSubscriptionForWebsite,
} from "./polar";
