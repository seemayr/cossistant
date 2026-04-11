import { describe, expect, it } from "bun:test";
import { getSelfHostedPlanInfo } from "./access";

describe("self-hosted plan resolution", () => {
	it("returns a synthetic unlimited plan with billing disabled", () => {
		const planInfo = getSelfHostedPlanInfo();

		expect(planInfo.planName).toBe("self_hosted");
		expect(planInfo.displayName).toBe("Self-Hosted");
		expect(planInfo.billing).toEqual({
			enabled: false,
			provider: "disabled",
			canManageSubscription: false,
		});
		expect(planInfo.hardLimitsEnforced).toBe(false);
		expect(planInfo.hardLimitsUnavailableReason).toBe("billing_disabled");
		expect(planInfo.features.contacts).toBeNull();
		expect(planInfo.features.messages).toBeNull();
		expect(planInfo.features["team-members"]).toBeNull();
		expect(planInfo.features["latest-ai-models"]).toBe(true);
		expect(planInfo.features["dashboard-file-sharing"]).toBe(true);
		expect(planInfo.features["ai-agent-training-interval"]).toBe(0);
	});
});
