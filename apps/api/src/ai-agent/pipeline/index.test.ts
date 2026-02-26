import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const intakeMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const decideMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const generateMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const executeMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const followupMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const logDecisionTimelineStateMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const guardAiCreditRunMock = mock((async () => ({
	allowed: true,
	mode: "normal",
	reason: "ok",
	blockedReason: null,
	minimumCharge: {
		baseCredits: 1,
		modelCredits: 0,
		toolCredits: 0,
		totalCredits: 1,
		billableToolCount: 0,
		excludedToolCount: 0,
		totalToolCount: 0,
	},
	balance: 10,
	meterBacked: true,
	meterSource: "live",
	lastSyncedAt: new Date().toISOString(),
})) as (...args: unknown[]) => Promise<unknown>);
const ingestAiCreditUsageMock = mock((async () => ({
	status: "ingested" as const,
})) as (...args: unknown[]) => Promise<{ status: string }>);
const logAiCreditUsageTimelineMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const createTimelineItemMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const updateTimelineItemMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const continuationGateMock = mock((async () => ({
	decision: "none" as const,
	reason: "default",
	confidence: "high" as const,
})) as (...args: unknown[]) => Promise<unknown>);
const resolvePromptBundleMock = mock((async () => ({
	coreDocuments: {
		"decision.md": {
			name: "decision.md",
			content: "default decision policy",
			source: "fallback",
			priority: 0,
		},
	},
	enabledSkills: [],
})) as (...args: unknown[]) => Promise<unknown>);
const fallbackSendMessageMock = mock(async () => ({
	messageId: "fallback-msg",
	created: true,
	paused: false,
}));

const emitDecisionMadeMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const emitWorkflowCompletedMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const emitTypingStopMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const typingHeartbeatStartMock = mock(async () => {});
const typingHeartbeatStopMock = mock(async () => {});

class MockTypingHeartbeat {
	private isRunning = false;

	async start(): Promise<void> {
		this.isRunning = true;
		await typingHeartbeatStartMock();
	}

	async stop(): Promise<void> {
		if (!this.isRunning) {
			return;
		}
		this.isRunning = false;
		await typingHeartbeatStopMock();
	}

	get running(): boolean {
		return this.isRunning;
	}
}

mock.module("./1-intake", () => ({
	intake: intakeMock,
}));

mock.module("./2-decision", () => ({
	decide: decideMock,
}));

mock.module("./3-generation", () => ({
	generate: generateMock,
}));

mock.module("./4-execution", () => ({
	execute: executeMock,
}));

mock.module("./5-followup", () => ({
	followup: followupMock,
}));

mock.module("./1b-continuation-gate", () => ({
	continuationGate: continuationGateMock,
}));

mock.module("../events", () => ({
	emitDecisionMade: emitDecisionMadeMock,
	emitTypingStop: emitTypingStopMock,
	emitWorkflowCompleted: emitWorkflowCompletedMock,
	TypingHeartbeat: MockTypingHeartbeat,
}));

mock.module("../actions/send-message", () => ({
	sendMessage: fallbackSendMessageMock,
}));

mock.module("../tools/tool-call-logger", () => ({
	logDecisionTimelineState: logDecisionTimelineStateMock,
	wrapToolsWithTimelineLogging: <T>(tools: T) => tools,
}));

mock.module("@api/lib/ai-credits/guard", () => ({
	guardAiCreditRun: guardAiCreditRunMock,
}));

mock.module("@api/lib/ai-credits/polar-meter", () => ({
	ingestAiCreditUsage: ingestAiCreditUsageMock,
}));

mock.module("@api/lib/ai-credits/timeline", () => ({
	logAiCreditUsageTimeline: logAiCreditUsageTimelineMock,
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
	updateTimelineItem: updateTimelineItemMock,
}));

mock.module("../prompts/resolver", () => ({
	resolvePromptBundle: resolvePromptBundleMock,
}));

const pipelineModulePromise = import("./index");

function buildReadyIntakeResult() {
	return {
		status: "ready",
		aiAgent: {
			id: "ai-1",
			model: "moonshotai/kimi-k2-0905",
		},
		modelResolution: {
			modelIdOriginal: "moonshotai/kimi-k2-0905",
			modelIdResolved: "moonshotai/kimi-k2-0905",
			modelMigrationApplied: false,
		},
		conversation: {
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
		},
		conversationHistory: [],
		visitorContext: null,
		conversationState: {},
		triggerMessage: {
			messageId: "trigger-msg-1",
			content: "hello",
			senderType: "human_agent",
			senderId: "user-1",
			senderName: "Agent",
			timestamp: new Date().toISOString(),
			visibility: "public",
		},
	};
}

function buildDecisionResult() {
	return {
		shouldAct: true,
		reason: "new visitor message",
		mode: "respond_to_visitor",
		humanCommand: null,
		isEscalated: false,
		escalationReason: null,
		smartDecision: null,
	};
}

describe("runAiAgentPipeline retryability and typing cleanup", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		intakeMock.mockReset();
		decideMock.mockReset();
		generateMock.mockReset();
		executeMock.mockReset();
		followupMock.mockReset();
		emitDecisionMadeMock.mockReset();
		emitWorkflowCompletedMock.mockReset();
		emitTypingStopMock.mockReset();
		typingHeartbeatStartMock.mockReset();
		typingHeartbeatStopMock.mockReset();
		logDecisionTimelineStateMock.mockReset();
		guardAiCreditRunMock.mockReset();
		ingestAiCreditUsageMock.mockReset();
		logAiCreditUsageTimelineMock.mockReset();
		createTimelineItemMock.mockReset();
		updateTimelineItemMock.mockReset();
		continuationGateMock.mockReset();
		resolvePromptBundleMock.mockReset();
		fallbackSendMessageMock.mockReset();

		intakeMock.mockResolvedValue(buildReadyIntakeResult());
		decideMock.mockResolvedValue(buildDecisionResult());
		executeMock.mockResolvedValue({});
		followupMock.mockResolvedValue(undefined);
		guardAiCreditRunMock.mockResolvedValue({
			allowed: true,
			mode: "normal",
			reason: "ok",
			blockedReason: null,
			minimumCharge: {
				baseCredits: 1,
				modelCredits: 0,
				toolCredits: 0,
				totalCredits: 1,
				billableToolCount: 0,
				excludedToolCount: 0,
				totalToolCount: 0,
			},
			balance: 10,
			meterBacked: true,
			meterSource: "live",
			lastSyncedAt: new Date().toISOString(),
		});
		ingestAiCreditUsageMock.mockResolvedValue({
			status: "ingested",
		});
		logAiCreditUsageTimelineMock.mockResolvedValue(undefined);
		createTimelineItemMock.mockResolvedValue({});
		updateTimelineItemMock.mockResolvedValue({});
		continuationGateMock.mockResolvedValue({
			decision: "none",
			reason: "default",
			confidence: "high",
		});
		fallbackSendMessageMock.mockResolvedValue({
			messageId: "fallback-msg",
			created: true,
			paused: false,
		});
		resolvePromptBundleMock.mockResolvedValue({
			coreDocuments: {
				"decision.md": {
					name: "decision.md",
					content: "default decision policy",
					source: "fallback",
					priority: 0,
				},
			},
			enabledSkills: [],
		});
	});

	it("marks failures before any public send as retryable", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		generateMock.mockImplementation(async () => {
			throw new Error("generation failed before send");
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-1",
				jobId: "job-1",
			},
		});

		expect(result.status).toBe("error");
		expect(result.publicMessagesSent).toBe(0);
		expect(result.retryable).toBe(true);
		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(logDecisionTimelineStateMock).toHaveBeenCalledTimes(2);
		expect(logDecisionTimelineStateMock.mock.calls[0]?.[0]).toMatchObject({
			state: "partial",
		});
		expect(logDecisionTimelineStateMock.mock.calls[1]?.[0]).toMatchObject({
			state: "result",
		});
		expect(typingHeartbeatStopMock).toHaveBeenCalledTimes(1);
		expect(emitTypingStopMock).toHaveBeenCalledTimes(1);
	});

	it("logs decision stage error when decisioning throws", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		decideMock.mockImplementation(async () => {
			throw new Error("decision failed");
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-decision-error",
				jobId: "job-decision-error",
			},
		});

		expect(result.status).toBe("error");
		expect(logDecisionTimelineStateMock).toHaveBeenCalledTimes(2);
		expect(logDecisionTimelineStateMock.mock.calls[0]?.[0]).toMatchObject({
			state: "partial",
		});
		expect(logDecisionTimelineStateMock.mock.calls[1]?.[0]).toMatchObject({
			state: "error",
		});
	});

	it("marks failures after a public send as non-retryable", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		generateMock.mockImplementation(async (...args: unknown[]) => {
			const [input] = args as [
				{
					onPublicMessageSent?: (params: {
						messageId: string;
						created: boolean;
					}) => void;
				},
			];
			input.onPublicMessageSent?.({
				messageId: "pub-msg-1",
				created: true,
			});
			throw new Error("generation failed after send");
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-2",
				jobId: "job-2",
			},
		});

		expect(result.status).toBe("error");
		expect(result.publicMessagesSent).toBe(1);
		expect(result.retryable).toBe(false);
		expect(logDecisionTimelineStateMock).toHaveBeenCalledTimes(2);
		expect(logDecisionTimelineStateMock.mock.calls[0]?.[0]).toMatchObject({
			state: "partial",
		});
		expect(logDecisionTimelineStateMock.mock.calls[1]?.[0]).toMatchObject({
			state: "result",
		});
		expect(typingHeartbeatStopMock).toHaveBeenCalledTimes(1);
		expect(emitTypingStopMock).toHaveBeenCalledTimes(1);
	});

	it("always emits final typing stop cleanup on successful runs", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		generateMock.mockResolvedValue({
			decision: {
				action: "skip",
				reasoning: "nothing to send",
				confidence: 0.8,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
			usedCustomSkills: [
				{
					name: "custom-playbook.md",
					description: "Custom support playbook",
				},
			],
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-3",
				jobId: "job-3",
			},
		});

		expect(result.status).toBe("completed");
		expect(result.retryable).toBe(false);
		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(logDecisionTimelineStateMock).toHaveBeenCalledTimes(2);
		expect(logDecisionTimelineStateMock.mock.calls[0]?.[0]).toMatchObject({
			state: "partial",
		});
		expect(logDecisionTimelineStateMock.mock.calls[1]?.[0]).toMatchObject({
			state: "result",
		});
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(createTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			conversationId: "conv-1",
			item: {
				tool: "aiSkillUsage",
				visibility: "private",
				type: "tool",
			},
		});
		expect(typingHeartbeatStopMock).toHaveBeenCalledTimes(1);
		expect(emitTypingStopMock).toHaveBeenCalledTimes(1);
	});

	it("does not log skill usage when decision skips before generation", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		decideMock.mockResolvedValue({
			shouldAct: false,
			reason: "no action needed",
			mode: "background_only",
			humanCommand: null,
			isEscalated: false,
			escalationReason: null,
			smartDecision: null,
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-decision-skip",
				jobId: "job-decision-skip",
			},
		});

		expect(result.status).toBe("skipped");
		expect(generateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
	});

	it("does not log skill usage when generation uses no custom skills", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		generateMock.mockResolvedValue({
			decision: {
				action: "skip",
				reasoning: "nothing to send",
				confidence: 0.8,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
			usedCustomSkills: [],
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-no-used-custom-skills",
				jobId: "job-no-used-custom-skills",
			},
		});

		expect(result.status).toBe("completed");
		expect(createTimelineItemMock).not.toHaveBeenCalled();
	});

	it("does not send fallback when authoritative public send already happened", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		generateMock.mockImplementation(async (...args: unknown[]) => {
			const [input] = args as [
				{
					onPublicMessageSent?: (params: {
						messageId: string;
						created: boolean;
					}) => void;
				},
			];
			input.onPublicMessageSent?.({
				messageId: "pub-msg-1",
				created: true,
			});
			return {
				decision: {
					action: "respond",
					reasoning: "repair state reported fallback despite send",
					confidence: 0.8,
				},
				needsFallbackMessage: true,
				toolCalls: {
					sendMessage: 0,
					sendPrivateMessage: 0,
				},
			};
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-fallback-authoritative-send",
				jobId: "job-fallback-authoritative-send",
			},
		});

		expect(result.status).toBe("completed");
		expect(result.publicMessagesSent).toBe(1);
		expect(fallbackSendMessageMock).not.toHaveBeenCalled();
	});

	it("skips before generation when credit guard blocks", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		guardAiCreditRunMock.mockResolvedValue({
			allowed: false,
			mode: "normal",
			reason: "Insufficient AI credits",
			blockedReason: "insufficient_credits",
			minimumCharge: {
				baseCredits: 1,
				modelCredits: 1,
				toolCredits: 0,
				totalCredits: 2,
				billableToolCount: 0,
				excludedToolCount: 0,
				totalToolCount: 0,
			},
			balance: 0,
			meterBacked: true,
			meterSource: "live",
			lastSyncedAt: new Date().toISOString(),
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-guard-block",
				jobId: "job-guard-block",
			},
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toContain("AI credit guard blocked run");
		expect(generateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(ingestAiCreditUsageMock).not.toHaveBeenCalled();
		expect(logAiCreditUsageTimelineMock).toHaveBeenCalledTimes(1);
	});

	it("does not fail pipeline when credit usage ingest returns failed", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		ingestAiCreditUsageMock.mockImplementation(async () => ({
			status: "failed",
		}));
		generateMock.mockResolvedValue({
			decision: {
				action: "skip",
				reasoning: "nothing to send",
				confidence: 0.8,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
			toolCallsByName: {
				searchKnowledgeBase: 3,
				sendMessage: 1,
			},
			totalToolCalls: 4,
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-ingest-fail",
				jobId: "job-ingest-fail",
			},
		});

		expect(result.status).toBe("completed");
		expect(ingestAiCreditUsageMock).toHaveBeenCalledTimes(1);
		expect(logAiCreditUsageTimelineMock).toHaveBeenCalledTimes(1);
		expect(logAiCreditUsageTimelineMock.mock.calls[0]?.[0]).toMatchObject({
			payload: {
				ingestStatus: "failed",
				modelId: "moonshotai/kimi-k2-0905",
				modelIdOriginal: "moonshotai/kimi-k2-0905",
				modelMigrationApplied: false,
			},
		});
	});

	it("logs backoff ingest status when metering is temporarily throttled", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		ingestAiCreditUsageMock.mockResolvedValue({
			status: "skipped_backoff",
		});
		generateMock.mockResolvedValue({
			decision: {
				action: "skip",
				reasoning: "nothing to send",
				confidence: 0.8,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-ingest-backoff",
				jobId: "job-ingest-backoff",
			},
		});

		expect(result.status).toBe("completed");
		expect(logAiCreditUsageTimelineMock.mock.calls.at(-1)?.[0]).toMatchObject({
			payload: {
				ingestStatus: "skipped_backoff",
			},
		});
	});

	it("continues successfully when skill usage timeline logging fails", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		createTimelineItemMock.mockRejectedValueOnce(
			new Error("timeline unavailable")
		);
		generateMock.mockResolvedValue({
			decision: {
				action: "skip",
				reasoning: "nothing to send",
				confidence: 0.8,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
			usedCustomSkills: [
				{
					name: "custom-playbook.md",
				},
			],
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-skill-log-fail-open",
				jobId: "job-skill-log-fail-open",
			},
		});

		expect(result.status).toBe("completed");
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
	});

	it("skips on continuation gate even when speculative decision policy prefetch fails", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		resolvePromptBundleMock.mockRejectedValueOnce(
			new Error("decision policy unavailable")
		);
		continuationGateMock.mockResolvedValueOnce({
			decision: "skip",
			reason: "already covered by newer AI reply",
			confidence: "high",
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-continuation-skip",
				jobId: "job-continuation-skip",
			},
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toContain("Continuation gate skipped trigger");
		expect(resolvePromptBundleMock).toHaveBeenCalledTimes(1);
		expect(decideMock).not.toHaveBeenCalled();
	});

	it("continues shouldAct=true path when decision event emit fails", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		emitDecisionMadeMock.mockRejectedValueOnce(new Error("event unavailable"));
		generateMock.mockResolvedValue({
			decision: {
				action: "skip",
				reasoning: "nothing to send",
				confidence: 0.8,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-event-fail-open-should-act",
				jobId: "job-event-fail-open-should-act",
			},
		});

		expect(result.status).toBe("completed");
		expect(emitDecisionMadeMock).toHaveBeenCalledTimes(1);
		expect(guardAiCreditRunMock).toHaveBeenCalledTimes(1);
	});

	it("returns skipped when shouldAct=false even if decision event emit fails", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		decideMock.mockResolvedValue({
			shouldAct: false,
			reason: "no action needed",
			mode: "background_only",
			humanCommand: null,
			isEscalated: false,
			escalationReason: null,
			smartDecision: null,
		});
		emitDecisionMadeMock.mockRejectedValueOnce(new Error("event unavailable"));

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-event-fail-open-skip",
				jobId: "job-event-fail-open-skip",
			},
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("no action needed");
		expect(emitDecisionMadeMock).toHaveBeenCalledTimes(1);
		expect(emitWorkflowCompletedMock).toHaveBeenCalledTimes(1);
		expect(generateMock).not.toHaveBeenCalled();
	});

	it("returns completed even when success completion event emit fails", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		generateMock.mockResolvedValue({
			decision: {
				action: "skip",
				reasoning: "nothing to send",
				confidence: 0.8,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
		});
		emitWorkflowCompletedMock.mockRejectedValueOnce(
			new Error("workflow completed event unavailable")
		);

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-completed-event-fail-open-success",
				jobId: "job-completed-event-fail-open-success",
			},
		});

		expect(result.status).toBe("completed");
		expect(executeMock).toHaveBeenCalledTimes(1);
		expect(emitWorkflowCompletedMock).toHaveBeenCalledTimes(1);
	});

	it("runs shouldAct decision event and credit guard exactly once each", async () => {
		const { runAiAgentPipeline } = await pipelineModulePromise;
		generateMock.mockResolvedValue({
			decision: {
				action: "skip",
				reasoning: "nothing to send",
				confidence: 0.8,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
		});

		const result = await runAiAgentPipeline({
			db: {} as never,
			input: {
				conversationId: "conv-1",
				messageId: "trigger-msg-1",
				messageCreatedAt: new Date().toISOString(),
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentId: "ai-1",
				workflowRunId: "workflow-should-act-parallel",
				jobId: "job-should-act-parallel",
			},
		});

		expect(result.status).toBe("completed");
		expect(emitDecisionMadeMock).toHaveBeenCalledTimes(1);
		expect(emitDecisionMadeMock.mock.calls[0]?.[0]).toMatchObject({
			shouldAct: true,
		});
		expect(guardAiCreditRunMock).toHaveBeenCalledTimes(1);
	});
});
