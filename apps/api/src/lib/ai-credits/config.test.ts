import { describe, expect, it } from "bun:test";
import {
	calculateAiCreditCharge,
	getAiModelsForPlan,
	getDefaultModelId,
	getMinimumAiCreditCharge,
	getModelSurchargeCredits,
	getToolCallStats,
	getToolCredits,
	isExcludedToolName,
	isHighEndModel,
	isKnownModel,
	isModelAllowedForPlan,
	isOutageAllowedModel,
	resolveModelForExecution,
} from "./config";

describe("ai credit pricing config", () => {
	it("charges base credits for non-high-end models", () => {
		const charge = getMinimumAiCreditCharge("moonshotai/kimi-k2-0905");

		expect(charge.baseCredits).toBe(1);
		expect(charge.modelCredits).toBe(0);
		expect(charge.totalCredits).toBe(1);
	});

	it("adds surcharge for high-end models", () => {
		expect(isHighEndModel("openai/gpt-5.2-chat")).toBe(true);
		expect(getModelSurchargeCredits("openai/gpt-5.2-chat")).toBe(1);

		const charge = getMinimumAiCreditCharge("openai/gpt-5.2-chat");

		expect(charge.baseCredits).toBe(1);
		expect(charge.modelCredits).toBe(1);
		expect(charge.totalCredits).toBe(2);
	});

	it("counts excluded tools and billable tools correctly", () => {
		expect(isExcludedToolName("sendMessage")).toBe(true);
		expect(isExcludedToolName("respond")).toBe(true);
		expect(isExcludedToolName("loadSkill")).toBe(true);
		expect(isExcludedToolName("searchKnowledgeBase")).toBe(false);

		const stats = getToolCallStats({
			sendMessage: 4,
			sendPrivateMessage: 1,
			loadSkill: 3,
			searchKnowledgeBase: 2,
			respond: 1,
			ignoreInvalid: -3,
		});

		expect(stats.totalToolCount).toBe(11);
		expect(stats.excludedToolCount).toBe(9);
		expect(stats.billableToolCount).toBe(2);
	});

	it("applies tool surcharge only after included billable tools", () => {
		expect(getToolCredits(0)).toBe(0);
		expect(getToolCredits(2)).toBe(0);
		expect(getToolCredits(3)).toBe(0.5);
		expect(getToolCredits(5)).toBe(1.5);
	});

	it("computes full charge with rounding stability", () => {
		const charge = calculateAiCreditCharge({
			modelId: "openai/gpt-5.1-chat",
			toolCallsByName: {
				sendMessage: 1,
				searchKnowledgeBase: 3,
				respond: 1,
			},
		});

		expect(charge.baseCredits).toBe(1);
		expect(charge.modelCredits).toBe(1);
		expect(charge.billableToolCount).toBe(3);
		expect(charge.excludedToolCount).toBe(2);
		expect(charge.toolCredits).toBe(0.5);
		expect(charge.totalCredits).toBe(2.5);
	});

	it("exposes one default model and resolves unknown models to default", () => {
		const defaultModelId = getDefaultModelId();
		expect(defaultModelId).toBe("moonshotai/kimi-k2-0905");

		const resolution = resolveModelForExecution("anthropic/claude-sonnet-4");
		expect(resolution.modelMigrationApplied).toBe(true);
		expect(resolution.modelIdOriginal).toBe("anthropic/claude-sonnet-4");
		expect(resolution.modelIdResolved).toBe(defaultModelId);
	});

	it("knows outage allowlist and plan entitlement from the same catalog", () => {
		expect(isKnownModel("moonshotai/kimi-k2.5")).toBe(true);
		expect(isKnownModel("unknown/model")).toBe(false);
		expect(isOutageAllowedModel("moonshotai/kimi-k2.5")).toBe(true);
		expect(isOutageAllowedModel("openai/gpt-5.1-chat")).toBe(false);

		expect(
			isModelAllowedForPlan({
				modelId: "openai/gpt-5.1-chat",
				latestModelsFeature: true,
			})
		).toBe(true);
		expect(
			isModelAllowedForPlan({
				modelId: "openai/gpt-5.1-chat",
				latestModelsFeature: false,
			})
		).toBe(false);
		expect(
			isModelAllowedForPlan({
				modelId: "unknown/model",
				latestModelsFeature: true,
			})
		).toBe(false);
	});

	it("builds plan model view with selectable flags", () => {
		const freeView = getAiModelsForPlan(false);
		expect(freeView.defaultModelId).toBe("moonshotai/kimi-k2-0905");
		expect(
			freeView.items.find((model) => model.id === "openai/gpt-5.2-chat")
				?.selectableForCurrentPlan
		).toBe(false);
		expect(
			freeView.items.find((model) => model.id === "moonshotai/kimi-k2-0905")
				?.selectableForCurrentPlan
		).toBe(true);

		const paidView = getAiModelsForPlan(true);
		expect(
			paidView.items.find((model) => model.id === "openai/gpt-5.2-chat")
				?.selectableForCurrentPlan
		).toBe(true);
	});
});
