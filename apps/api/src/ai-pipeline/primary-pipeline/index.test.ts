import { beforeEach, describe, expect, it, mock } from "bun:test";

const logAiPipelineMock = mock((_params: unknown) => {});
const runIntakeStepMock = mock((async () => ({
	status: "ready",
	data: {
		aiAgent: { id: "ai-1" },
		modelResolution: {
			modelIdResolved: "moonshotai/kimi-k2.5",
			modelIdOriginal: "moonshotai/kimi-k2.5",
			modelMigrationApplied: false,
		},
		conversation: { id: "conv-1" },
		conversationHistory: [],
		visitorContext: null,
		conversationState: {
			hasHumanAssignee: false,
			assigneeIds: [],
			participantIds: [],
			isEscalated: false,
			escalationReason: null,
		},
		continuationContext: null,
		triggerMessageText: "Need help",
		triggerMessage: {
			messageId: "msg-1",
			senderType: "visitor",
			visibility: "public",
		},
	},
})) as (...args: unknown[]) => Promise<any>);
const runDecisionStepMock = mock((async () => ({
	shouldAct: true,
	reason: "respond",
	mode: "respond_to_visitor",
	humanCommand: null,
	isEscalated: false,
	escalationReason: null,
})) as (...args: unknown[]) => Promise<any>);
const runGenerationRuntimeMock = mock((async () => ({
	status: "completed",
	action: {
		action: "respond",
		reasoning: "ok",
		confidence: 1,
	},
	publicMessagesSent: 1,
	toolCallsByName: {},
	totalToolCalls: 0,
})) as (...args: unknown[]) => Promise<any>);
const maybeCreateImmediateClarificationFromSearchGapMock = mock((async () => ({
	status: "skipped" as const,
	reason: "no_search" as const,
})) as (...args: unknown[]) => Promise<any>);
const trackGenerationUsageMock = mock(async () => {});
const emitPipelineSeenMock = mock(async () => {});
const emitPipelineProcessingCompletedMock = mock(async () => {});
const emitPipelineGenerationProgressMock = mock(async () => {});
const emitPipelineToolProgressMock = mock(async () => {});
const emitPipelineTypingStartMock = mock(async () => {});
const emitPipelineTypingStopMock = mock(async () => {});
const typingHeartbeatStartMock = mock(() => {});
const typingHeartbeatStopMock = mock(() => {});

class PipelineTypingHeartbeatMock {
	private isRunning = false;

	async start() {
		if (this.isRunning) {
			return;
		}
		typingHeartbeatStartMock();
		this.isRunning = true;
	}

	async stop() {
		if (!this.isRunning) {
			return;
		}
		typingHeartbeatStopMock();
		this.isRunning = false;
	}

	get running() {
		return this.isRunning;
	}
}

mock.module("../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

mock.module("./steps/intake", () => ({
	runIntakeStep: runIntakeStepMock,
}));

mock.module("./steps/decision", () => ({
	runDecisionStep: runDecisionStepMock,
}));

mock.module("../shared/generation", () => ({
	runGenerationRuntime: runGenerationRuntimeMock,
}));

mock.module("../shared/knowledge-gap/immediate-clarification", () => ({
	maybeCreateImmediateClarificationFromSearchGap:
		maybeCreateImmediateClarificationFromSearchGapMock,
}));

mock.module("../shared/usage", () => ({
	trackGenerationUsage: trackGenerationUsageMock,
}));

mock.module("../shared/events", () => ({
	emitPipelineSeen: emitPipelineSeenMock,
	emitPipelineProcessingCompleted: emitPipelineProcessingCompletedMock,
	emitPipelineProcessingCompletedSafely: emitPipelineProcessingCompletedMock,
	emitPipelineGenerationProgress: emitPipelineGenerationProgressMock,
	emitPipelineToolProgress: emitPipelineToolProgressMock,
	emitPipelineTypingStart: emitPipelineTypingStartMock,
	emitPipelineTypingStop: emitPipelineTypingStopMock,
	PipelineTypingHeartbeat: PipelineTypingHeartbeatMock,
}));

const modulePromise = import("./index");

const baseInput = {
	conversationId: "conv-1",
	messageId: "msg-1",
	messageCreatedAt: "2026-03-05T00:00:00.000Z",
	websiteId: "site-1",
	organizationId: "org-1",
	visitorId: "visitor-1",
	aiAgentId: "ai-1",
	workflowRunId: "wf-1",
	jobId: "job-1",
};

describe("runPrimaryPipeline generation error/skip behavior", () => {
	beforeEach(() => {
		logAiPipelineMock.mockClear();
		runIntakeStepMock.mockClear();
		runDecisionStepMock.mockClear();
		runGenerationRuntimeMock.mockClear();
		maybeCreateImmediateClarificationFromSearchGapMock.mockClear();
		trackGenerationUsageMock.mockClear();
		emitPipelineSeenMock.mockClear();
		emitPipelineProcessingCompletedMock.mockClear();
		emitPipelineGenerationProgressMock.mockClear();
		emitPipelineToolProgressMock.mockClear();
		emitPipelineTypingStartMock.mockClear();
		emitPipelineTypingStopMock.mockClear();
		typingHeartbeatStartMock.mockClear();
		typingHeartbeatStopMock.mockClear();

		runIntakeStepMock.mockResolvedValue({
			status: "ready",
			data: {
				aiAgent: { id: "ai-1" },
				modelResolution: {
					modelIdResolved: "moonshotai/kimi-k2.5",
					modelIdOriginal: "moonshotai/kimi-k2.5",
					modelMigrationApplied: false,
				},
				conversation: { id: "conv-1" },
				conversationHistory: [],
				visitorContext: null,
				conversationState: {
					hasHumanAssignee: false,
					assigneeIds: [],
					participantIds: [],
					isEscalated: false,
					escalationReason: null,
				},
				continuationContext: null,
				triggerMessageText: "Need help",
				triggerMessage: {
					messageId: "msg-1",
					senderType: "visitor",
					visibility: "public",
				},
			},
		});
		runDecisionStepMock.mockResolvedValue({
			shouldAct: true,
			reason: "respond",
			mode: "respond_to_visitor",
			humanCommand: null,
			isEscalated: false,
			escalationReason: null,
		});
		runGenerationRuntimeMock.mockResolvedValue({
			status: "completed",
			action: {
				action: "respond",
				reasoning: "ok",
				confidence: 1,
			},
			publicMessagesSent: 1,
			toolCallsByName: {},
			totalToolCalls: 0,
		});
		maybeCreateImmediateClarificationFromSearchGapMock.mockResolvedValue({
			status: "skipped",
			reason: "no_search",
		});
		trackGenerationUsageMock.mockResolvedValue(undefined);
	});

	it("surfaces generation timeout as error (not skip)", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "error",
			action: {
				action: "skip",
				reasoning: "Generation timed out; retryable failure",
				confidence: 1,
			},
			error: "Generation timed out",
			failureCode: "timeout",
			publicMessagesSent: 0,
			toolCallsByName: {},
			totalToolCalls: 0,
			attempts: [
				{
					modelId: "moonshotai/kimi-k2.5",
					attempt: 1,
					outcome: "timeout",
					durationMs: 45_000,
				},
			],
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("error");
		expect(result.retryable).toBe(true);
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "error",
				workflowRunId: "wf-1",
			})
		);

		const primaryLogs = logAiPipelineMock.mock.calls
			.map(
				(call) =>
					call[0] as
						| {
								area?: string;
								event?: string;
								fields?: Record<string, unknown>;
						  }
						| undefined
			)
			.filter(
				(
					entry
				): entry is {
					area?: string;
					event?: string;
					fields?: Record<string, unknown>;
				} => Boolean(entry)
			)
			.filter((entry) => entry.area === "primary");

		expect(
			primaryLogs.some(
				(entry) =>
					entry.event === "generation_error" &&
					entry.fields?.failureCode === "timeout"
			)
		).toBe(true);
		expect(
			primaryLogs.some(
				(entry) =>
					entry.event === "skip" && entry.fields?.stage === "generation"
			)
		).toBe(false);
	});

	it("emits generation skip only for explicit skip action", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "completed",
			action: {
				action: "skip",
				reasoning: "Explicit no-op",
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {
				skip: 1,
			},
			totalToolCalls: 1,
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("Explicit no-op");
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "skipped",
				workflowRunId: "wf-1",
			})
		);

		const primaryLogs = logAiPipelineMock.mock.calls
			.map(
				(call) =>
					call[0] as
						| {
								area?: string;
								event?: string;
								fields?: Record<string, unknown>;
						  }
						| undefined
			)
			.filter(
				(
					entry
				): entry is {
					area?: string;
					event?: string;
					fields?: Record<string, unknown>;
				} => Boolean(entry)
			)
			.filter((entry) => entry.area === "primary");

		expect(
			primaryLogs.some(
				(entry) =>
					entry.event === "skip" &&
					entry.fields?.stage === "generation" &&
					entry.fields?.reason === "Explicit no-op"
			)
		).toBe(true);
		expect(
			primaryLogs.some((entry) => entry.event === "generation_error")
		).toBe(false);
	});

	it("keeps generation failures retryable when no public messages were sent", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "error",
			action: {
				action: "skip",
				reasoning: "Generation runtime error",
				confidence: 1,
			},
			error: "Generation runtime failed",
			failureCode: "runtime_error",
			publicMessagesSent: 0,
			toolCallsByName: {},
			totalToolCalls: 0,
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("error");
		expect(result.retryable).toBe(true);
	});

	it("advances the cursor after generation errors that happen after durable mutations", async () => {
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "error",
			action: {
				action: "skip",
				reasoning: "Escalation confirmation failed after mutation",
				confidence: 1,
			},
			error: "Escalation confirmation failed after mutation",
			failureCode: "runtime_error",
			publicMessagesSent: 0,
			toolCallsByName: {
				escalate: 1,
			},
			mutationToolCallsByName: {
				escalate: 1,
			},
			totalToolCalls: 1,
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("error");
		expect(result.retryable).toBe(false);
		expect(result.cursorDisposition).toBe("advance");
	});

	it("starts the typing heartbeat for public runs and stops it once before send cleanup", async () => {
		runGenerationRuntimeMock.mockImplementationOnce(async (input) => {
			const runtimeInput = input as {
				startTyping?: unknown;
				stopTyping?: () => Promise<void>;
			};

			expect(runtimeInput.startTyping).toBeUndefined();
			expect(typeof runtimeInput.stopTyping).toBe("function");

			await runtimeInput.stopTyping?.();

			return {
				status: "completed",
				action: {
					action: "respond",
					reasoning: "ok",
					confidence: 1,
				},
				publicMessagesSent: 1,
				toolCallsByName: {
					sendMessage: 1,
					respond: 1,
				},
				totalToolCalls: 2,
			};
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(typingHeartbeatStartMock).toHaveBeenCalledTimes(1);
		expect(typingHeartbeatStopMock).toHaveBeenCalledTimes(1);
		expect(emitPipelineTypingStopMock).not.toHaveBeenCalled();
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "success",
				action: "respond",
				workflowRunId: "wf-1",
			})
		);
	});

	it("passes continuation context into generation runtime", async () => {
		runIntakeStepMock.mockResolvedValueOnce({
			status: "ready",
			data: {
				aiAgent: { id: "ai-1" },
				modelResolution: {
					modelIdResolved: "moonshotai/kimi-k2.5",
					modelIdOriginal: "moonshotai/kimi-k2.5",
					modelMigrationApplied: false,
				},
				conversation: { id: "conv-1" },
				conversationHistory: [],
				visitorContext: null,
				conversationState: {
					hasHumanAssignee: false,
					assigneeIds: [],
					participantIds: [],
					isEscalated: false,
					escalationReason: null,
				},
				continuationContext: {
					previousProcessedMessageId: "msg-0",
					previousProcessedMessageCreatedAt: "2026-03-04T23:59:00.000Z",
					latestAiReply: "I already asked for the visitor's order number.",
				},
				triggerMessageText: "Any update?",
				triggerMessage: {
					messageId: "msg-1",
					senderType: "visitor",
					visibility: "public",
				},
			},
		});

		const { runPrimaryPipeline } = await modulePromise;
		const result = await runPrimaryPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(runGenerationRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				continuationContext: {
					previousProcessedMessageId: "msg-0",
					previousProcessedMessageCreatedAt: "2026-03-04T23:59:00.000Z",
					latestAiReply: "I already asked for the visitor's order number.",
				},
			})
		);
	});
});
