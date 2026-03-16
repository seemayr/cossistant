import { beforeEach, describe, expect, it, mock } from "bun:test";

const calculateAiCreditChargeMock = mock(() => ({
	baseCredits: 1,
	modelCredits: 1,
	toolCredits: 0,
	totalCredits: 2,
	billableToolCount: 0,
	excludedToolCount: 0,
	totalToolCount: 0,
}));

const getMinimumAiCreditChargeMock = mock(() => ({
	baseCredits: 1,
	modelCredits: 0,
	toolCredits: 0,
	totalCredits: 1,
	billableToolCount: 0,
	excludedToolCount: 0,
	totalToolCount: 0,
}));

const ingestAiCreditUsageMock = mock(async () => ({
	status: "ingested" as const,
}));

const logGenerationUsageTimelineMock = mock(async () => {});
const logAiPipelineMock = mock(() => {});

mock.module("@api/lib/ai-credits/config", () => ({
	calculateAiCreditCharge: calculateAiCreditChargeMock,
	getMinimumAiCreditCharge: getMinimumAiCreditChargeMock,
}));

mock.module("@api/lib/ai-credits/polar-meter", () => ({
	ingestAiCreditUsage: ingestAiCreditUsageMock,
}));

mock.module("./timeline", () => ({
	logGenerationUsageTimeline: logGenerationUsageTimelineMock,
	AI_CREDIT_USAGE_TIMELINE_TOOL_NAME: "aiCreditUsage",
}));

mock.module("../../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

async function loadUsageModule() {
	const moduleUrl = new URL("./index.ts", import.meta.url);
	moduleUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
	return import(moduleUrl.href);
}

describe("trackGenerationUsage", () => {
	beforeEach(() => {
		calculateAiCreditChargeMock.mockClear();
		getMinimumAiCreditChargeMock.mockClear();
		ingestAiCreditUsageMock.mockClear();
		logGenerationUsageTimelineMock.mockClear();
		logAiPipelineMock.mockClear();
		ingestAiCreditUsageMock.mockResolvedValue({
			status: "ingested" as const,
		});
	});

	it("bills and logs conversation-linked clarification usage", async () => {
		const { trackGenerationUsage } = await loadUsageModule();

		await trackGenerationUsage({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			conversationId: "conv_1",
			visitorId: "visitor_1",
			aiAgentId: "agent_1",
			usageEventId: "usage_evt_1",
			triggerMessageId: "clar_req_1",
			modelId: "openai/gpt-5.2-chat",
			providerUsage: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
			},
			source: "knowledge_clarification",
			phase: "clarification_question",
			knowledgeClarificationRequestId: "clar_req_1",
			knowledgeClarificationStepIndex: 2,
		});

		const ingestCall = ingestAiCreditUsageMock.mock.calls[0] as unknown as
			| [Record<string, unknown>]
			| undefined;
		const timelineCall = logGenerationUsageTimelineMock.mock
			.calls[0] as unknown as [Record<string, unknown>] | undefined;

		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(ingestCall?.[0]).toMatchObject({
			organizationId: "org_1",
			workflowRunId: "usage_evt_1",
			modelId: "openai/gpt-5.2-chat",
			credits: 1,
		});

		expect(logGenerationUsageTimelineMock).toHaveBeenCalledTimes(1);
		expect(timelineCall?.[0]).toMatchObject({
			conversationId: "conv_1",
			visitorId: "visitor_1",
			aiAgentId: "agent_1",
			payload: {
				usageEventId: "usage_evt_1",
				triggerMessageId: "clar_req_1",
				source: "knowledge_clarification",
				phase: "clarification_question",
				knowledgeClarificationRequestId: "clar_req_1",
				knowledgeClarificationStepIndex: 2,
				totalTokens: 160,
			},
		});
	});

	it("bills faq-origin clarification usage without creating a conversation timeline item", async () => {
		const { trackGenerationUsage } = await loadUsageModule();

		await trackGenerationUsage({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			usageEventId: "usage_evt_2",
			modelId: "moonshotai/kimi-k2-0905",
			providerUsage: {
				inputTokens: 80,
				outputTokens: 20,
				totalTokens: 100,
			},
			source: "knowledge_clarification",
			phase: "faq_draft_generation",
			knowledgeClarificationRequestId: "clar_req_2",
			knowledgeClarificationStepIndex: 3,
		});

		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(logGenerationUsageTimelineMock).not.toHaveBeenCalled();
	});
});
