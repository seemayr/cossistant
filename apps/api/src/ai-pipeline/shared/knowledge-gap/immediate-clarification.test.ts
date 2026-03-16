import { beforeEach, describe, expect, it, mock } from "bun:test";

const getActiveKnowledgeClarificationForConversationMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<{ id: string } | null>
);
const requestKnowledgeClarificationMock = mock(async () => ({
	requestId: "req_1",
	created: true,
	status: "awaiting_answer" as const,
}));

mock.module("@api/db/queries/knowledge-clarification", () => ({
	getActiveKnowledgeClarificationForConversation:
		getActiveKnowledgeClarificationForConversationMock,
}));

mock.module("../actions/request-knowledge-clarification", () => ({
	requestKnowledgeClarification: requestKnowledgeClarificationMock,
}));

const modulePromise = import("./immediate-clarification");

function createIntake() {
	return {
		aiAgent: {
			id: "ai-1",
			behaviorSettings: {
				canRequestKnowledgeClarification: true,
			},
		},
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
		},
		conversationHistory: [
			{
				messageId: "msg-1",
				content: "How do I permanently delete my account?",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-16T09:00:00.000Z",
				visibility: "public",
			},
		],
		triggerMessage: {
			messageId: "msg-1",
			content: "How do I permanently delete my account?",
			senderType: "visitor",
			senderId: "visitor-1",
			senderName: null,
			timestamp: "2026-03-16T09:00:00.000Z",
			visibility: "public",
		},
		triggerMessageText: "How do I permanently delete my account?",
	} as never;
}

function createSearchExecution(params: {
	query: string;
	questionContext?: string;
	totalFound: number;
	maxSimilarity: number | null;
	retrievalQuality: "none" | "weak" | "strong";
	clarificationSignal: "immediate" | "background_review" | "none";
}) {
	return {
		toolName: "searchKnowledgeBase",
		state: "result",
		input: {
			query: params.query,
		},
		output: {
			success: true,
			data: {
				articles: [],
				query: params.query,
				questionContext: params.questionContext ?? null,
				totalFound: params.totalFound,
				maxSimilarity: params.maxSimilarity,
				retrievalQuality: params.retrievalQuality,
				clarificationSignal: params.clarificationSignal,
			},
		},
	} as const;
}

function createGenerationResult(toolExecutions: unknown[]) {
	return {
		status: "completed",
		action: {
			action: "skip",
			reasoning: "No answer sent",
			confidence: 1,
		},
		publicMessagesSent: 0,
		toolCallsByName: {
			searchKnowledgeBase: toolExecutions.length,
		},
		mutationToolCallsByName: {},
		chargeableToolCallsByName: {},
		totalToolCalls: toolExecutions.length,
		toolExecutions,
	} as never;
}

describe("maybeCreateImmediateClarificationFromSearchGap", () => {
	beforeEach(() => {
		getActiveKnowledgeClarificationForConversationMock.mockReset();
		requestKnowledgeClarificationMock.mockReset();
		getActiveKnowledgeClarificationForConversationMock.mockResolvedValue(null);
		requestKnowledgeClarificationMock.mockResolvedValue({
			requestId: "req_1",
			created: true,
			status: "awaiting_answer",
		});
	});

	it("creates a clarification when every KB search stays at retrievalQuality=none", async () => {
		const { maybeCreateImmediateClarificationFromSearchGap } =
			await modulePromise;

		const result = await maybeCreateImmediateClarificationFromSearchGap({
			db: {} as never,
			intake: createIntake(),
			generationResult: createGenerationResult([
				createSearchExecution({
					query: "account deletion",
					questionContext: "How do I permanently delete my account?",
					totalFound: 0,
					maxSimilarity: null,
					retrievalQuality: "none",
					clarificationSignal: "immediate",
				}),
			]),
		});

		expect(result).toMatchObject({
			status: "created",
			requestId: "req_1",
			created: true,
		});
		expect(requestKnowledgeClarificationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				topicSummary:
					"Missing exact answer for: How do I permanently delete my account?",
				contextSnapshot: expect.objectContaining({
					sourceTrigger: expect.objectContaining({
						text: "How do I permanently delete my account?",
					}),
				}),
			})
		);
	});

	it("skips the immediate clarification when a later search finds a weak or strong match", async () => {
		const { maybeCreateImmediateClarificationFromSearchGap } =
			await modulePromise;

		const result = await maybeCreateImmediateClarificationFromSearchGap({
			db: {} as never,
			intake: createIntake(),
			generationResult: createGenerationResult([
				createSearchExecution({
					query: "account deletion",
					totalFound: 0,
					maxSimilarity: null,
					retrievalQuality: "none",
					clarificationSignal: "immediate",
				}),
				createSearchExecution({
					query: "delete account policy",
					totalFound: 1,
					maxSimilarity: 0.61,
					retrievalQuality: "weak",
					clarificationSignal: "background_review",
				}),
			]),
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "search_not_obvious_gap",
		});
		expect(requestKnowledgeClarificationMock).not.toHaveBeenCalled();
	});

	it("skips when the conversation already has an active clarification", async () => {
		getActiveKnowledgeClarificationForConversationMock.mockResolvedValueOnce({
			id: "req_existing",
		});

		const { maybeCreateImmediateClarificationFromSearchGap } =
			await modulePromise;

		const result = await maybeCreateImmediateClarificationFromSearchGap({
			db: {} as never,
			intake: createIntake(),
			generationResult: createGenerationResult([
				createSearchExecution({
					query: "account deletion",
					totalFound: 0,
					maxSimilarity: null,
					retrievalQuality: "none",
					clarificationSignal: "immediate",
				}),
			]),
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "active_clarification_exists",
		});
		expect(requestKnowledgeClarificationMock).not.toHaveBeenCalled();
	});
});
