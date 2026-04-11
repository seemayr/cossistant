import { describe, expect, it } from "bun:test";
import type { PlanAiCredits } from "./ai-credit-usage";
import { formatAiCreditAmount, getAiCreditUsageView } from "./ai-credit-usage";

function buildAiCredits(overrides: Partial<PlanAiCredits> = {}): PlanAiCredits {
	return {
		balance: 87.5,
		consumedUnits: 12.5,
		creditedUnits: 100,
		meterBacked: true,
		source: "live",
		lastSyncedAt: "2026-03-11T00:00:00.000Z",
		...overrides,
	} as PlanAiCredits;
}

describe("ai credit usage view", () => {
	it("formats fractional credit values with up to 2 decimals", () => {
		expect(formatAiCreditAmount(12.5)).toBe("12.5");
		expect(formatAiCreditAmount(100)).toBe("100");
		expect(formatAiCreditAmount(12.345)).toBe("12.35");
	});

	it("returns a renderable view for live Polar-backed credits", () => {
		const view = getAiCreditUsageView(buildAiCredits());

		expect(view).toEqual({
			kind: "metered",
			current: 12.5,
			limit: 100,
			remaining: 87.5,
			usageLabel: "12.5 / 100 used this cycle",
			remainingLabel: "87.5 left",
		});
	});

	it("renders cache and stale-cache sources when meter-backed", () => {
		const cacheView = getAiCreditUsageView(buildAiCredits({ source: "cache" }));
		const staleView = getAiCreditUsageView(
			buildAiCredits({ source: "stale_cache" })
		);

		expect(cacheView?.usageLabel).toBe("12.5 / 100 used this cycle");
		expect(staleView?.remainingLabel).toBe("87.5 left");
	});

	it("falls back to derived remaining balance when live balance is missing", () => {
		const view = getAiCreditUsageView(buildAiCredits({ balance: null }));

		expect(view?.remaining).toBe(87.5);
		expect(view?.remainingLabel).toBe("87.5 left");
	});

	it("shows unlimited credits when billing is disabled", () => {
		const view = getAiCreditUsageView(
			buildAiCredits({
				balance: null,
				consumedUnits: null,
				creditedUnits: null,
				meterBacked: false,
				source: "disabled",
			})
		);

		expect(view).toEqual({
			kind: "unlimited",
			current: 0,
			limit: null,
			remaining: null,
			usageLabel: "Unlimited in self-hosted mode",
			remainingLabel: null,
		});
	});

	it("hides fallback or outage-only credit states", () => {
		const planFallbackView = getAiCreditUsageView(
			buildAiCredits({
				balance: 100,
				consumedUnits: null,
				creditedUnits: 100,
				meterBacked: false,
				source: "plan_fallback",
			})
		);
		const outageView = getAiCreditUsageView(
			buildAiCredits({
				balance: null,
				consumedUnits: null,
				creditedUnits: null,
				meterBacked: false,
				source: "unavailable",
			})
		);

		expect(planFallbackView).toBeNull();
		expect(outageView).toBeNull();
	});

	it("fails closed when credited or consumed units are not finite numbers", () => {
		expect(
			getAiCreditUsageView(buildAiCredits({ creditedUnits: null }))
		).toBeNull();
		expect(
			getAiCreditUsageView(buildAiCredits({ consumedUnits: null }))
		).toBeNull();
	});
});
