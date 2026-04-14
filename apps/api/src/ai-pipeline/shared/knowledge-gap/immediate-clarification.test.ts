import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { IntakeReadyContext } from "../../primary-pipeline/steps/intake/types";
import type { PipelineToolContext } from "../tools/contracts";

const getActiveKnowledgeClarificationForConversationMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<{ id: string } | null>
);
const buildConversationTranscriptMock = mock((async () => [
	{
		messageId: "msg-1",
		content: "How do I permanently delete my account?",
		senderType: "visitor",
		senderId: "visitor-1",
		senderName: null,
		timestamp: "2026-03-16T09:00:00.000Z",
		visibility: "public",
	},
]) as (...args: unknown[]) => Promise<unknown[]>);
const requestKnowledgeClarificationMock = mock(async () => ({
	requestId: "req_1",
	created: true,
	status: "awaiting_answer" as const,
}));

mock.module("@api/db/queries/knowledge-clarification", () => ({
	getActiveKnowledgeClarificationForConversation:
		getActiveKnowledgeClarificationForConversationMock,
}));

mock.module("@api/ai-pipeline/primary-pipeline/steps/intake/history", () => ({
	buildConversationTranscript: buildConversationTranscriptMock,
}));

mock.module("../actions/request-knowledge-clarification", () => ({
	requestKnowledgeClarification: requestKnowledgeClarificationMock,
}));

const modulePromise = import("./immediate-clarification");

function createIntake(): IntakeReadyContext {
	return {
		aiAgent: {
			id: "ai-1",
			name: "Agent",
			model: "moonshotai/kimi-k2.5",
			behaviorSettings: {
				canRequestKnowledgeClarification: true,
			},
		} as never,
		modelResolution: {
			modelIdResolved: "moonshotai/kimi-k2.5",
			modelIdOriginal: "moonshotai/kimi-k2.5",
			modelMigrationApplied: false,
		},
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
		} as never,
		websiteDefaultLanguage: "en",
		visitorLanguage: "en",
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
		decisionMessages: [
			{
				messageId: "msg-1",
				content: "How do I permanently delete my account?",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-16T09:00:00.000Z",
				visibility: "public",
				segment: "trigger",
			},
		],
		generationEntries: [
			{
				messageId: "msg-1",
				content: "How do I permanently delete my account?",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-16T09:00:00.000Z",
				visibility: "public",
				segment: "trigger",
			},
		],
		visitorContext: null,
		conversationState: {
			hasHumanAssignee: false,
			assigneeIds: [],
			participantIds: [],
			isEscalated: false,
			escalationReason: null,
		},
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
		hasLaterHumanMessage: false,
		hasLaterAiMessage: false,
	};
}

function createToolContext(
	overrides: Partial<PipelineToolContext> = {}
): PipelineToolContext {
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
		websiteDefaultLanguage: "en",
		visitorLanguage: "en",
		workflowRunId: "wf-1",
		triggerMessageId: "msg-1",
		triggerMessageText: "How do I permanently delete my account?",
		triggerMessageCreatedAt: "2026-03-16T09:00:00.000Z",
		allowPublicMessages: true,
		pipelineKind: "primary",
		mode: "respond_to_visitor",
		isEscalated: false,
		canCategorize: false,
		canRequestKnowledgeClarification: true,
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
			immediateKnowledgeGapClarificationHandled: false,
			publicSendSequence: 0,
			privateSendSequence: 0,
			sentPublicMessageIds: new Set<string>(),
			lastToolError: null,
		},
		...overrides,
	};
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
		buildConversationTranscriptMock.mockReset();
		requestKnowledgeClarificationMock.mockReset();
		getActiveKnowledgeClarificationForConversationMock.mockResolvedValue(null);
		buildConversationTranscriptMock.mockResolvedValue([
			{
				messageId: "msg-1",
				content: "How do I permanently delete my account?",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-16T09:00:00.000Z",
				visibility: "public",
			},
		]);
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

	it("keeps the first eligible zero-hit clarification even if a later search finds a weak match", async () => {
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

		expect(result).toMatchObject({
			status: "created",
			requestId: "req_1",
			created: true,
		});
		expect(requestKnowledgeClarificationMock).toHaveBeenCalledTimes(1);
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

	it("skips vague zero-hit searches when the visitor intent is not specific enough", async () => {
		const { maybeCreateImmediateClarificationFromSearchGap } =
			await modulePromise;

		const intake = createIntake();
		intake.triggerMessageText = "Any update?";
		intake.triggerMessage = {
			messageId: "msg-1",
			content: "Any update?",
			senderType: "visitor",
			senderId: "visitor-1",
			senderName: null,
			timestamp: "2026-03-16T09:00:00.000Z",
			visibility: "public",
		};
		intake.conversationHistory = [
			{
				messageId: "msg-1",
				content: "Any update?",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-16T09:00:00.000Z",
				visibility: "public",
			},
		];

		const result = await maybeCreateImmediateClarificationFromSearchGap({
			db: {} as never,
			intake,
			generationResult: createGenerationResult([
				createSearchExecution({
					query: "status update",
					totalFound: 0,
					maxSimilarity: null,
					retrievalQuality: "none",
					clarificationSignal: "immediate",
				}),
			]),
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "insufficient_intent",
		});
		expect(requestKnowledgeClarificationMock).not.toHaveBeenCalled();
	});

	it("keeps weak-search cases on the background-review path", async () => {
		const { maybeCreateImmediateClarificationFromSearchGap } =
			await modulePromise;

		const result = await maybeCreateImmediateClarificationFromSearchGap({
			db: {} as never,
			intake: createIntake(),
			generationResult: createGenerationResult([
				createSearchExecution({
					query: "billing timing",
					questionContext: "When does the billing change apply?",
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
});

describe("maybeCreateImmediateClarificationFromSearchResult", () => {
	beforeEach(() => {
		getActiveKnowledgeClarificationForConversationMock.mockReset();
		buildConversationTranscriptMock.mockReset();
		requestKnowledgeClarificationMock.mockReset();
		getActiveKnowledgeClarificationForConversationMock.mockResolvedValue(null);
		buildConversationTranscriptMock.mockResolvedValue([
			{
				messageId: "msg-1",
				content: "How do I permanently delete my account?",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-16T09:00:00.000Z",
				visibility: "public",
			},
		]);
		requestKnowledgeClarificationMock.mockResolvedValue({
			requestId: "req_1",
			created: true,
			status: "awaiting_answer",
		});
	});

	it("creates a clarification immediately when a zero-hit search has strong question context", async () => {
		const { maybeCreateImmediateClarificationFromSearchResult } =
			await modulePromise;
		const ctx = createToolContext();

		const result = await maybeCreateImmediateClarificationFromSearchResult({
			ctx,
			searchResult: {
				articles: [],
				query: "account deletion",
				questionContext: "How do I permanently delete my account?",
				totalFound: 0,
				maxSimilarity: null,
				retrievalQuality: "none",
				clarificationSignal: "immediate",
			},
		});

		expect(result).toMatchObject({
			status: "created",
			requestId: "req_1",
			created: true,
		});
		expect(ctx.runtimeState.immediateKnowledgeGapClarificationHandled).toBe(
			true
		);
	});

	it("skips the immediate clarification when only a vague trigger is available", async () => {
		const { maybeCreateImmediateClarificationFromSearchResult } =
			await modulePromise;
		const ctx = createToolContext({
			triggerMessageText: "Any update?",
		});

		const result = await maybeCreateImmediateClarificationFromSearchResult({
			ctx,
			searchResult: {
				articles: [],
				query: "status update",
				questionContext: null,
				totalFound: 0,
				maxSimilarity: null,
				retrievalQuality: "none",
				clarificationSignal: "immediate",
			},
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "insufficient_intent",
		});
		expect(requestKnowledgeClarificationMock).not.toHaveBeenCalled();
		expect(buildConversationTranscriptMock).not.toHaveBeenCalled();
	});

	it("creates a clarification from a specific trigger when questionContext is missing", async () => {
		const { maybeCreateImmediateClarificationFromSearchResult } =
			await modulePromise;
		const ctx = createToolContext({
			triggerMessageText: "Can I permanently delete my account?",
		});
		buildConversationTranscriptMock.mockResolvedValueOnce([
			{
				messageId: "msg-1",
				content: "Can I permanently delete my account?",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-16T09:00:00.000Z",
				visibility: "public",
			},
		]);

		const result = await maybeCreateImmediateClarificationFromSearchResult({
			ctx,
			searchResult: {
				articles: [],
				query: "account deletion",
				questionContext: null,
				totalFound: 0,
				maxSimilarity: null,
				retrievalQuality: "none",
				clarificationSignal: "immediate",
			},
		});

		expect(result).toMatchObject({
			status: "created",
			requestId: "req_1",
			created: true,
		});
		expect(requestKnowledgeClarificationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				topicSummary:
					"Missing exact answer for: Can I permanently delete my account?",
			})
		);
	});

	it("does not create duplicate clarifications across repeated zero-hit searches in the same run", async () => {
		const { maybeCreateImmediateClarificationFromSearchResult } =
			await modulePromise;
		const ctx = createToolContext();
		const searchResult = {
			articles: [],
			query: "account deletion",
			questionContext: "How do I permanently delete my account?",
			totalFound: 0,
			maxSimilarity: null,
			retrievalQuality: "none" as const,
			clarificationSignal: "immediate" as const,
		};

		const firstResult = await maybeCreateImmediateClarificationFromSearchResult(
			{
				ctx,
				searchResult,
			}
		);
		const secondResult =
			await maybeCreateImmediateClarificationFromSearchResult({
				ctx,
				searchResult,
			});

		expect(firstResult).toMatchObject({
			status: "created",
		});
		expect(secondResult).toEqual({
			status: "skipped",
			reason: "already_requested",
		});
		expect(requestKnowledgeClarificationMock).toHaveBeenCalledTimes(1);
	});
});
