import { describe, expect, it } from "bun:test";
import { getBehaviorSettings, getDefaultBehaviorSettings } from "./defaults";

describe("getDefaultBehaviorSettings", () => {
	it("enables knowledge clarification by default", () => {
		expect(getDefaultBehaviorSettings().canRequestKnowledgeClarification).toBe(
			true
		);
	});
});

describe("getBehaviorSettings", () => {
	it("treats missing clarification settings as enabled", () => {
		expect(
			getBehaviorSettings({
				behaviorSettings: {},
			} as never).canRequestKnowledgeClarification
		).toBe(true);
	});

	it("preserves explicit clarification opt-outs", () => {
		expect(
			getBehaviorSettings({
				behaviorSettings: {
					canRequestKnowledgeClarification: false,
				},
			} as never).canRequestKnowledgeClarification
		).toBe(false);
	});
});
