import { beforeEach, describe, expect, it, mock } from "bun:test";

const logAiPipelineMock = mock((_params: unknown) => {});
const getAiAgentByIdMock = mock(async () => ({
	id: "ai-1",
	name: "Agent",
	model: "moonshotai/kimi-k2.5",
	basePrompt: "Help the visitor.",
	isActive: true,
	behaviorSettings: {},
}));
const getBehaviorSettingsMock = mock(() => ({
	autoGenerateTitle: true,
	autoAnalyzeSentiment: true,
	canSetPriority: true,
	autoCategorize: false,
	canCategorize: false,
	canRequestKnowledgeClarification: true,
}));
const listActiveWebsiteViewsMock = mock(
	(async (): Promise<
		Array<{
			id: string;
			name: string;
			description: string | null;
			prompt: string | null;
		}>
	> => []) as (...args: unknown[]) => Promise<
		Array<{
			id: string;
			name: string;
			description: string | null;
			prompt: string | null;
		}>
	>
);
const resolveAndPersistModelMock = mock(
	async ({ aiAgent }: { aiAgent: any }) => ({
		aiAgent,
		modelResolution: {
			modelIdResolved: aiAgent.model,
			modelIdOriginal: aiAgent.model,
			modelMigrationApplied: false,
		},
	})
);
const loadConversationSeedMock = mock(async () => ({
	conversation: {
		id: "conv-1",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
	},
	triggerMetadata: {
		id: "msg-1",
		createdAt: "2026-03-04T10:00:00.000Z",
		conversationId: "conv-1",
	},
}));
const loadIntakeContextMock = mock(async () => ({
	conversationHistory: [],
	decisionMessages: [],
	generationEntries: [],
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
		content: "Please help",
		senderType: "visitor",
		senderId: null,
		senderName: null,
		timestamp: "2026-03-04T10:00:00.000Z",
		visibility: "public",
	},
	hasLaterHumanMessage: false,
	hasLaterAiMessage: false,
}));
const emitPipelineProcessingCompletedMock = mock(async () => {});
const emitPipelineSeenMock = mock(async () => {});
const emitPipelineGenerationProgressMock = mock(async () => {});
const emitPipelineToolProgressMock = mock(async () => {});
const emitPipelineTypingStartMock = mock(async () => {});
const emitPipelineTypingStopMock = mock(async () => {});
class PipelineTypingHeartbeatMock {
	running = false;
	async start() {}
	async stop() {}
}
const runGenerationRuntimeMock = mock((async () => ({
	status: "completed" as const,
	action: {
		action: "skip" as const,
		reasoning: "Updated sentiment",
		confidence: 1,
	},
	publicMessagesSent: 0,
	toolCallsByName: {
		updateSentiment: 1,
		skip: 1,
	},
	mutationToolCallsByName: {
		updateSentiment: 1,
	},
	totalToolCalls: 2,
})) as (...args: unknown[]) => Promise<any>);
const runBackgroundKnowledgeGapReviewMock = mock((async () => ({
	status: "skipped" as const,
	reason: "no_candidate_gap" as const,
})) as (...args: unknown[]) => Promise<any>);

mock.module("../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

mock.module("@api/db/queries/ai-agent", () => ({
	getAiAgentById: getAiAgentByIdMock,
}));

mock.module("@api/db/queries/view", () => ({
	listActiveWebsiteViews: listActiveWebsiteViewsMock,
}));

mock.module("@api/ai-pipeline/shared/settings", () => ({
	getBehaviorSettings: getBehaviorSettingsMock,
}));

mock.module("../primary-pipeline/steps/intake/model-resolution", () => ({
	resolveAndPersistModel: resolveAndPersistModelMock,
}));

mock.module("../primary-pipeline/steps/intake/load-context", () => ({
	loadConversationSeed: loadConversationSeedMock,
	loadIntakeContext: loadIntakeContextMock,
}));

mock.module("../shared/generation", () => ({
	runGenerationRuntime: runGenerationRuntimeMock,
}));

mock.module("./knowledge-gap-review", () => ({
	runBackgroundKnowledgeGapReview: runBackgroundKnowledgeGapReviewMock,
}));

mock.module("../shared/events", () => ({
	emitPipelineProcessingCompleted: emitPipelineProcessingCompletedMock,
	emitPipelineProcessingCompletedSafely: emitPipelineProcessingCompletedMock,
	emitPipelineSeen: emitPipelineSeenMock,
	emitPipelineGenerationProgress: emitPipelineGenerationProgressMock,
	emitPipelineToolProgress: emitPipelineToolProgressMock,
	emitPipelineTypingStart: emitPipelineTypingStartMock,
	emitPipelineTypingStop: emitPipelineTypingStopMock,
	PipelineTypingHeartbeat: PipelineTypingHeartbeatMock,
}));

const modulePromise = import("./index");

const baseInput = {
	conversationId: "conv-1",
	websiteId: "site-1",
	organizationId: "org-1",
	aiAgentId: "ai-1",
	sourceMessageId: "msg-1",
	sourceMessageCreatedAt: "2026-03-04T10:00:00.000Z",
	workflowRunId: "wf-1",
	jobId: "job-1",
};

describe("runBackgroundPipeline", () => {
	beforeEach(() => {
		logAiPipelineMock.mockClear();
		getAiAgentByIdMock.mockReset();
		getBehaviorSettingsMock.mockReset();
		resolveAndPersistModelMock.mockReset();
		loadConversationSeedMock.mockReset();
		loadIntakeContextMock.mockReset();
		emitPipelineProcessingCompletedMock.mockReset();
		runGenerationRuntimeMock.mockReset();
		runBackgroundKnowledgeGapReviewMock.mockReset();

		getAiAgentByIdMock.mockResolvedValue({
			id: "ai-1",
			name: "Agent",
			model: "moonshotai/kimi-k2.5",
			basePrompt: "Help the visitor.",
			isActive: true,
			behaviorSettings: {},
		});
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: true,
			autoAnalyzeSentiment: true,
			canSetPriority: true,
			autoCategorize: false,
			canCategorize: false,
			canRequestKnowledgeClarification: true,
		});
		listActiveWebsiteViewsMock.mockReset();
		listActiveWebsiteViewsMock.mockResolvedValue([]);
		resolveAndPersistModelMock.mockImplementation(async ({ aiAgent }) => ({
			aiAgent,
			modelResolution: {
				modelIdResolved: aiAgent.model,
				modelIdOriginal: aiAgent.model,
				modelMigrationApplied: false,
			},
		}));
		loadConversationSeedMock.mockResolvedValue({
			conversation: {
				id: "conv-1",
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-1",
			},
			triggerMetadata: {
				id: "msg-1",
				createdAt: "2026-03-04T10:00:00.000Z",
				conversationId: "conv-1",
			},
		});
		loadIntakeContextMock.mockResolvedValue({
			conversationHistory: [],
			decisionMessages: [],
			generationEntries: [],
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
				content: "Please help",
				senderType: "visitor",
				senderId: null,
				senderName: null,
				timestamp: "2026-03-04T10:00:00.000Z",
				visibility: "public",
			},
			hasLaterHumanMessage: false,
			hasLaterAiMessage: false,
		});
		runGenerationRuntimeMock.mockResolvedValue({
			status: "completed",
			action: {
				action: "skip",
				reasoning: "Updated sentiment",
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {
				updateSentiment: 1,
				skip: 1,
			},
			mutationToolCallsByName: {
				updateSentiment: 1,
			},
			totalToolCalls: 2,
		});
		runBackgroundKnowledgeGapReviewMock.mockResolvedValue({
			status: "skipped",
			reason: "no_candidate_gap",
		});
	});

	it("skips when no background analysis capabilities are enabled", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: false,
			autoAnalyzeSentiment: false,
			canSetPriority: false,
			autoCategorize: false,
			canCategorize: false,
			canRequestKnowledgeClarification: false,
		});

		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("No background analysis capabilities enabled");
		expect(runGenerationRuntimeMock).not.toHaveBeenCalled();
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "skipped",
				workflowRunId: "wf-1",
				audience: "dashboard",
			})
		);
	});

	it("anchors analysis to the source message and restricts tools to metadata updates", async () => {
		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: {
				...baseInput,
				sourceMessageId: "msg-42",
				sourceMessageCreatedAt: "2026-03-04T10:05:00.000Z",
			},
		});

		expect(result.status).toBe("completed");
		expect(loadConversationSeedMock).toHaveBeenCalledWith(expect.anything(), {
			conversationId: "conv-1",
			messageId: "msg-42",
			organizationId: "org-1",
		});
		expect(runGenerationRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				pipelineKind: "background",
				mode: "background_only",
				triggerMessageId: "msg-42",
				triggerMessageCreatedAt: "2026-03-04T10:05:00.000Z",
				generationEntries: [],
				allowPublicMessages: false,
				hasLaterHumanMessage: false,
				hasLaterAiMessage: false,
				toolAllowlist: [
					"updateConversationTitle",
					"updateSentiment",
					"setPriority",
					"skip",
				],
				availableViews: [],
			})
		);
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "success",
				workflowRunId: "wf-1",
				audience: "dashboard",
			})
		);
	});

	it("returns skipped when the analysis run makes no metadata mutation", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "completed",
			action: {
				action: "skip",
				reasoning: "Nothing new to update",
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {
				skip: 1,
			},
			mutationToolCallsByName: {},
			totalToolCalls: 1,
		});

		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("Nothing new to update");
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "skipped",
				workflowRunId: "wf-1",
				audience: "dashboard",
			})
		);
	});

	it("loads active views and enables categorizeConversation when categorization is available", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: false,
			autoAnalyzeSentiment: false,
			canSetPriority: false,
			autoCategorize: true,
			canCategorize: true,
			canRequestKnowledgeClarification: true,
		});
		listActiveWebsiteViewsMock.mockResolvedValueOnce([
			{
				id: "view-1",
				name: "billing",
				description: "Money and plan questions",
				prompt: "Use for billing issues",
			},
		]);

		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(listActiveWebsiteViewsMock).toHaveBeenCalledWith(expect.anything(), {
			websiteId: "site-1",
		});
		expect(runGenerationRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				toolAllowlist: ["categorizeConversation", "skip"],
				availableViews: [
					{
						id: "view-1",
						name: "billing",
						description: "Money and plan questions",
						prompt: "Use for billing issues",
					},
				],
			})
		);
	});
});
