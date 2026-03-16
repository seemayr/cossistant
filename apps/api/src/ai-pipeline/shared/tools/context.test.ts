import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PipelineToolContext } from "./contracts";

const findSimilarKnowledgeMock = mock(
	(async () =>
		[] as Array<{
			content: string;
			similarity: number;
			metadata: Record<string, unknown> | null;
		}>) as (...args: unknown[]) => Promise<
		Array<{
			content: string;
			similarity: number;
			metadata: Record<string, unknown> | null;
		}>
	>
);

mock.module("@api/utils/vector-search", () => ({
	findSimilarKnowledge: findSimilarKnowledgeMock,
}));

const modulePromise = import("./context");

function createContext(): PipelineToolContext {
	return {
		db: {} as never,
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
		} as never,
		conversationId: "conv-1",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		aiAgentName: "Agent",
		visitorName: "Visitor",
		workflowRunId: "wf-1",
		triggerMessageId: "msg-1",
		allowPublicMessages: true,
		pipelineKind: "primary",
		mode: "respond_to_visitor",
		isEscalated: false,
		canCategorize: false,
		availableViews: [],
		runtimeState: {
			finalAction: null,
			publicMessagesSent: 0,
			toolCallCounts: {},
			mutationToolCallCounts: {},
			successfulToolCallCounts: {},
			failedToolCallCounts: {},
			chargeableToolCallCounts: {},
			toolExecutions: [],
			publicSendSequence: 0,
			privateSendSequence: 0,
			sentPublicMessageIds: new Set<string>(),
			lastToolError: null,
		},
	};
}

describe("createSearchKnowledgeBaseTool", () => {
	beforeEach(() => {
		findSimilarKnowledgeMock.mockReset();
	});

	it("marks zero relevant matches as an immediate clarification signal", async () => {
		findSimilarKnowledgeMock.mockResolvedValueOnce([]);

		const { createSearchKnowledgeBaseTool } = await modulePromise;
		const tool = createSearchKnowledgeBaseTool(createContext());
		const result = await tool.execute?.(
			{
				query: "account deletion",
				questionContext: "How do I permanently delete my account?",
			},
			{} as never
		);

		expect(result).toMatchObject({
			success: true,
			data: {
				totalFound: 0,
				maxSimilarity: null,
				retrievalQuality: "none",
				clarificationSignal: "immediate",
				questionContext: "How do I permanently delete my account?",
			},
		});
	});

	it("marks mid-confidence matches for background review", async () => {
		findSimilarKnowledgeMock.mockResolvedValueOnce([
			{
				content: "Billing updates apply later",
				similarity: 0.62,
				metadata: {
					title: "Billing changes",
					url: "https://example.com/billing",
					sourceType: "faq",
				},
			},
		]);

		const { createSearchKnowledgeBaseTool } = await modulePromise;
		const tool = createSearchKnowledgeBaseTool(createContext());
		const result = await tool.execute?.(
			{
				query: "billing timing",
			},
			{} as never
		);

		expect(result).toMatchObject({
			success: true,
			data: {
				totalFound: 1,
				maxSimilarity: 0.62,
				retrievalQuality: "weak",
				clarificationSignal: "background_review",
			},
		});
	});

	it("treats strong matches as sufficiently grounded", async () => {
		findSimilarKnowledgeMock.mockResolvedValueOnce([
			{
				content: "You can export data from settings.",
				similarity: 0.81,
				metadata: {
					title: "Export data",
					url: "https://example.com/export",
					sourceType: "faq",
				},
			},
		]);

		const { createSearchKnowledgeBaseTool } = await modulePromise;
		const tool = createSearchKnowledgeBaseTool(createContext());
		const result = await tool.execute?.(
			{
				query: "export data",
			},
			{} as never
		);

		expect(result).toMatchObject({
			success: true,
			data: {
				totalFound: 1,
				maxSimilarity: 0.81,
				retrievalQuality: "strong",
				clarificationSignal: "none",
			},
		});
	});
});
