import { PLAN_CONFIG, type PlanName } from "@api/lib/plans/config";

export type PlanPricing = {
	price?: number;
	promoPrice?: number;
	hasPromo: boolean;
};

export type DisplayPlanName = PlanName | "self_hosted";

export function getPlanPricing(planName: DisplayPlanName): PlanPricing {
	if (planName === "self_hosted") {
		return {
			price: undefined,
			promoPrice: undefined,
			hasPromo: false,
		};
	}

	const config = PLAN_CONFIG[planName] ?? PLAN_CONFIG.free;
	const price = config.price;
	const promoPrice = config.priceWithPromo;
	const hasPromo =
		typeof price === "number" &&
		typeof promoPrice === "number" &&
		promoPrice < price;

	return {
		price,
		promoPrice,
		hasPromo,
	};
}
