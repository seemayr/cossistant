import { beforeEach, describe, expect, it, mock } from "bun:test";

const createTimelineItemMock = mock((async () => ({ id: "timeline-1" })) as (
	...args: unknown[]
) => Promise<unknown>);
const updateTimelineItemMock = mock((async () => ({ id: "timeline-1" })) as (
	...args: unknown[]
) => Promise<unknown>);

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
	updateTimelineItem: updateTimelineItemMock,
}));

const modulePromise = import("./timeline");

describe("logGenerationUsageTimeline", () => {
	beforeEach(() => {
		createTimelineItemMock.mockReset();
		updateTimelineItemMock.mockReset();
		createTimelineItemMock.mockResolvedValue({ id: "timeline-1" });
		updateTimelineItemMock.mockResolvedValue({ id: "timeline-1" });
	});

	it("logs aiCreditUsage tool timeline payload with tokens and credits", async () => {
		const { logGenerationUsageTimeline } = await modulePromise;

		await logGenerationUsageTimeline({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			payload: {
				workflowRunId: "wf-1",
				triggerMessageId: "trigger-1",
				modelId: "moonshotai/kimi-k2.5",
				inputTokens: 100,
				outputTokens: 50,
				totalTokens: 150,
				tokenSource: "provider",
				baseCredits: 1,
				modelCredits: 0,
				toolCredits: 0.5,
				totalCredits: 1.5,
				billableToolCount: 3,
				excludedToolCount: 1,
				totalToolCount: 4,
				mode: "normal",
				ingestStatus: "ingested",
				balanceBefore: null,
				balanceAfterEstimate: null,
			},
		});

		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(createTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				tool: "aiCreditUsage",
				text: "AI usage: 150 tokens, 1.5 credits",
				parts: [
					{
						toolName: "aiCreditUsage",
						toolCallId: "ai-credit-usage",
						state: "result",
						output: {
							totalTokens: 150,
							totalCredits: 1.5,
						},
					},
				],
			},
		});
	});

	it("updates existing row when create fails with unique violation", async () => {
		const { logGenerationUsageTimeline } = await modulePromise;
		createTimelineItemMock.mockRejectedValue({ code: "23505" });

		await logGenerationUsageTimeline({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			payload: {
				workflowRunId: "wf-1",
				triggerMessageId: "trigger-1",
				modelId: "moonshotai/kimi-k2.5",
				inputTokens: 100,
				outputTokens: 50,
				totalTokens: 150,
				tokenSource: "provider",
				baseCredits: 1,
				modelCredits: 0,
				toolCredits: 0,
				totalCredits: 1,
				billableToolCount: 0,
				excludedToolCount: 0,
				totalToolCount: 0,
				mode: "normal",
				ingestStatus: "skipped",
				balanceBefore: null,
				balanceAfterEstimate: null,
			},
		});

		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				tool: "aiCreditUsage",
			},
		});
	});

	it("updates existing row when create fails with wrapped unique violation", async () => {
		const { logGenerationUsageTimeline } = await modulePromise;
		createTimelineItemMock.mockRejectedValue({ cause: { code: "23505" } });

		await logGenerationUsageTimeline({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			payload: {
				workflowRunId: "wf-1",
				triggerMessageId: "trigger-1",
				modelId: "moonshotai/kimi-k2.5",
				inputTokens: 100,
				outputTokens: 50,
				totalTokens: 150,
				tokenSource: "provider",
				baseCredits: 1,
				modelCredits: 0,
				toolCredits: 0,
				totalCredits: 1,
				billableToolCount: 0,
				excludedToolCount: 0,
				totalToolCount: 0,
				mode: "normal",
				ingestStatus: "skipped",
				balanceBefore: null,
				balanceAfterEstimate: null,
			},
		});

		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
	});

	it("throws when create fails with non-unique wrapped error", async () => {
		const { logGenerationUsageTimeline } = await modulePromise;
		createTimelineItemMock.mockRejectedValue({
			cause: { code: "XX000" },
			message: "internal error",
		});

		await expect(
			logGenerationUsageTimeline({
				db: {} as never,
				organizationId: "org-1",
				websiteId: "site-1",
				conversationId: "conv-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				payload: {
					workflowRunId: "wf-1",
					triggerMessageId: "trigger-1",
					modelId: "moonshotai/kimi-k2.5",
					inputTokens: 100,
					outputTokens: 50,
					totalTokens: 150,
					tokenSource: "provider",
					baseCredits: 1,
					modelCredits: 0,
					toolCredits: 0,
					totalCredits: 1,
					billableToolCount: 0,
					excludedToolCount: 0,
					totalToolCount: 0,
					mode: "normal",
					ingestStatus: "skipped",
					balanceBefore: null,
					balanceAfterEstimate: null,
				},
			})
		).rejects.toMatchObject({
			cause: { code: "XX000" },
		});

		expect(updateTimelineItemMock).not.toHaveBeenCalled();
	});
});
