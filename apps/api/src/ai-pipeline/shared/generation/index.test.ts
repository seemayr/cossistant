import { beforeEach, describe, expect, it, mock } from "bun:test";

const createModelMock = mock((modelId: string) => modelId);
const hasToolCallMock = mock((_toolName: string) => () => false);
const stepCountIsMock = mock((_count: number) => () => false);
const getBehaviorSettingsMock = mock(() => ({
	maxToolInvocationsPerRun: 15,
}));
const buildGenerationSystemPromptMock = mock(() => "system-prompt");
const formatHistoryForGenerationMock = mock(() => [
	{ role: "user" as const, content: "hello" },
]);
const logAiPipelineMock = mock(() => {});
const emitPipelineGenerationProgressMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);

type MockAgentOptions = {
	model: string;
	instructions: string;
	tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
};

type MockAgentInput = {
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	abortSignal?: AbortSignal;
};

const queuedGenerateHandlers: Array<
	(params: {
		options: MockAgentOptions;
		input: MockAgentInput;
	}) => Promise<unknown>
> = [];

class ToolLoopAgentMock {
	private readonly options: MockAgentOptions;

	constructor(options: MockAgentOptions) {
		this.options = options;
	}

	async generate(input: MockAgentInput): Promise<unknown> {
		const handler = queuedGenerateHandlers.shift();
		if (!handler) {
			throw new Error("No queued generate handler");
		}
		return handler({ options: this.options, input });
	}
}

const buildPipelineToolsetMock = mock(
	({
		context,
	}: {
		context: {
			runtimeState: {
				toolCallCounts: Record<string, number>;
				publicMessagesSent: number;
				publicMessageToolSequence: Array<
					"sendAcknowledgeMessage" | "sendMessage" | "sendFollowUpMessage"
				>;
				publicMessageToolCounts: {
					sendAcknowledgeMessage: number;
					sendMessage: number;
					sendFollowUpMessage: number;
				};
				finalAction: {
					action: "respond" | "skip";
					reasoning: string;
					confidence: number;
				} | null;
			};
		};
	}) => {
		const increment = (toolName: string) => {
			context.runtimeState.toolCallCounts[toolName] =
				(context.runtimeState.toolCallCounts[toolName] ?? 0) + 1;
		};

		return {
			tools: {
				searchKnowledgeBase: {
					description: "Search KB",
					execute: async () => {
						increment("searchKnowledgeBase");
						return { success: true };
					},
				},
				sendMessage: {
					description: "Send message",
					execute: async (_input: unknown) => {
						increment("sendMessage");
						context.runtimeState.publicMessagesSent += 1;
						context.runtimeState.publicMessageToolCounts.sendMessage += 1;
						context.runtimeState.publicMessageToolSequence.push("sendMessage");
						return {
							success: true,
							data: { messageId: `msg-${Date.now()}`, created: true },
						};
					},
				},
				respond: {
					description: "Finish respond",
					execute: async (input: unknown) => {
						const parsed = input as { reasoning: string; confidence: number };
						increment("respond");
						context.runtimeState.finalAction = {
							action: "respond",
							reasoning: parsed.reasoning,
							confidence: parsed.confidence,
						};
						return { success: true };
					},
				},
				skip: {
					description: "Finish skip",
					execute: async (input: unknown) => {
						const parsed = input as { reasoning: string };
						increment("skip");
						context.runtimeState.finalAction = {
							action: "skip",
							reasoning: parsed.reasoning,
							confidence: 1,
						};
						return { success: true };
					},
				},
			},
			toolNames: ["searchKnowledgeBase", "sendMessage", "respond", "skip"],
			finishToolNames: ["respond", "skip"],
		};
	}
);

mock.module("@api/lib/ai", () => ({
	createModel: createModelMock,
	hasToolCall: hasToolCallMock,
	stepCountIs: stepCountIsMock,
	ToolLoopAgent: ToolLoopAgentMock,
}));

mock.module("../settings", () => ({
	getBehaviorSettings: getBehaviorSettingsMock,
}));

mock.module("../tools", () => ({
	buildPipelineToolset: buildPipelineToolsetMock,
}));

mock.module("../prompt/resolver", () => ({
	resolvePromptBundle: mock(async () => ({
		coreDocuments: {},
		enabledSkills: [],
	})),
}));

mock.module("./prompt/builder", () => ({
	buildGenerationSystemPrompt: buildGenerationSystemPromptMock,
}));

mock.module("./messages/format-history", () => ({
	formatHistoryForGeneration: formatHistoryForGenerationMock,
}));

mock.module("../../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

mock.module("../events", () => ({
	emitPipelineGenerationProgress: emitPipelineGenerationProgressMock,
}));

const modulePromise = import("./index");

function createAbortError(): Error {
	const error = new Error("aborted");
	error.name = "AbortError";
	return error;
}

function createInput(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		db: {} as never,
		pipelineKind: "primary" as const,
		mode: "respond_to_visitor" as const,
		aiAgent: {
			id: "ai-1",
			name: "Agent",
			model: "moonshotai/kimi-k2.5",
			behaviorSettings: {},
		} as never,
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
		} as never,
		conversationHistory: [],
		visitorContext: null,
		conversationState: {
			hasHumanAssignee: false,
			assigneeIds: [],
			participantIds: [],
			isEscalated: false,
			escalationReason: null,
		},
		humanCommand: null,
		workflowRunId: "wf-1",
		triggerMessageId: "msg-trigger-1",
		allowPublicMessages: true,
		...overrides,
	};
}

describe("runGenerationRuntime", () => {
	beforeEach(() => {
		queuedGenerateHandlers.length = 0;
		createModelMock.mockClear();
		hasToolCallMock.mockClear();
		stepCountIsMock.mockClear();
		getBehaviorSettingsMock.mockClear();
		buildGenerationSystemPromptMock.mockClear();
		formatHistoryForGenerationMock.mockClear();
		buildPipelineToolsetMock.mockClear();
		logAiPipelineMock.mockClear();
		emitPipelineGenerationProgressMock.mockClear();
	});

	it("retries on timeout and succeeds with fallback model", async () => {
		queuedGenerateHandlers.push(async () => {
			throw createAbortError();
		});
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.sendMessage.execute({ message: "Hello there" });
			await options.tools.respond.execute({
				reasoning: "Handled",
				confidence: 1,
			});
			return {
				usage: {
					inputTokens: 10,
					outputTokens: 20,
					totalTokens: 30,
				},
			};
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("respond");
		expect(result.publicMessagesSent).toBe(1);
		expect(result.attempts).toHaveLength(2);
		expect(result.attempts?.[0]).toMatchObject({
			modelId: "moonshotai/kimi-k2.5",
			attempt: 1,
			outcome: "timeout",
		});
		expect(result.attempts?.[1]).toMatchObject({
			modelId: "openai/gpt-4o-mini",
			attempt: 2,
			outcome: "completed",
		});
		expect(createModelMock.mock.calls.map((call) => call[0])).toEqual([
			"moonshotai/kimi-k2.5",
			"openai/gpt-4o-mini",
		]);
	});

	it("returns error when both attempts time out before any public message", async () => {
		queuedGenerateHandlers.push(async () => {
			throw createAbortError();
		});
		queuedGenerateHandlers.push(async () => {
			throw createAbortError();
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("timeout");
		expect(result.publicMessagesSent).toBe(0);
		expect(
			result.attempts?.map((attempt: { outcome: string }) => attempt.outcome)
		).toEqual(["timeout", "timeout"]);
	});

	it("completes without retry when timeout happens after a public message", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.sendMessage.execute({ message: "First message" });
			throw createAbortError();
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("skip");
		expect(result.failureCode).toBe("timeout");
		expect(result.publicMessagesSent).toBe(1);
		expect(result.attempts).toHaveLength(1);
		expect(createModelMock).toHaveBeenCalledTimes(1);
	});

	it("returns missing_finish_action error when no finish tool is called", async () => {
		queuedGenerateHandlers.push(async () => ({ usage: {} }));
		queuedGenerateHandlers.push(async () => ({ usage: {} }));

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("missing_finish_action");
		expect(result.publicMessagesSent).toBe(0);
		expect(result.attempts).toHaveLength(2);
		expect(result.attempts?.[0]?.outcome).toBe("error");
		expect(result.attempts?.[1]?.outcome).toBe("error");
	});

	it("keeps explicit skip as a valid completed silent outcome", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("skip");
		expect(result.failureCode).toBeUndefined();
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts?.[0]?.outcome).toBe("completed");
	});

	it("fails visitor-facing completion when main sendMessage was not called", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.respond.execute({
				reasoning: "No public reply sent",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("runtime_error");
		expect(result.error).toContain("requires sendMessage");
	});
});
