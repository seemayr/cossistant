import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const createModelMock = mock((modelId: string) => modelId);
const hasToolCallMock = mock((_toolName: string) => () => false);
const stepCountIsMock = mock((_count: number) => () => false);
const getBehaviorSettingsMock = mock(() => ({
	maxToolInvocationsPerRun: 15,
}));
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
const SYSTEM_PROMPT_DEBUG_DIR = resolve(
	import.meta.dir,
	"../../../../debug/system-prompts"
);
const originalNodeEnv = process.env.NODE_ENV;

function getSystemPromptFilePath(
	conversationId = "conv-1",
	triggerMessageId = "msg-trigger-1"
): string {
	return join(
		SYSTEM_PROMPT_DEBUG_DIR,
		conversationId,
		triggerMessageId,
		"system-prompt.md"
	);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

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
			basePrompt: "You are a helpful support assistant.",
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
		process.env.NODE_ENV = "test";
		createModelMock.mockClear();
		hasToolCallMock.mockClear();
		stepCountIsMock.mockClear();
		getBehaviorSettingsMock.mockClear();
		formatHistoryForGenerationMock.mockClear();
		buildPipelineToolsetMock.mockClear();
		logAiPipelineMock.mockClear();
		emitPipelineGenerationProgressMock.mockClear();
	});

	afterEach(async () => {
		process.env.NODE_ENV = originalNodeEnv;
		await rm(SYSTEM_PROMPT_DEBUG_DIR, { recursive: true, force: true });
	});

	it("writes the exact final system prompt to the non-production debug path", async () => {
		let capturedSystemPrompt = "";
		queuedGenerateHandlers.push(async ({ options }) => {
			capturedSystemPrompt = options.instructions;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(capturedSystemPrompt.length).toBeGreaterThan(0);
		expect(await readFile(getSystemPromptFilePath(), "utf8")).toBe(
			capturedSystemPrompt
		);
	});

	it("does not write a system prompt dump in production", async () => {
		process.env.NODE_ENV = "production";
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(await fileExists(getSystemPromptFilePath())).toBe(false);
	});

	it("overwrites the existing system prompt dump for the same trigger", async () => {
		const { runGenerationRuntime } = await modulePromise;
		let firstPrompt = "";
		let secondPrompt = "";

		queuedGenerateHandlers.push(async ({ options }) => {
			firstPrompt = options.instructions;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});
		await runGenerationRuntime(createInput() as never);

		queuedGenerateHandlers.push(async ({ options }) => {
			secondPrompt = options.instructions;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});
		await runGenerationRuntime(
			createInput({
				humanCommand: "Please provide the updated next steps.",
			}) as never
		);

		expect(firstPrompt).not.toBe(secondPrompt);
		expect(await readFile(getSystemPromptFilePath(), "utf8")).toBe(
			secondPrompt
		);
	});

	it("swallows debug dump write failures without changing generation results", async () => {
		const originalWarn = console.warn;
		const consoleWarnMock = mock(() => {});
		console.warn = consoleWarnMock as typeof console.warn;

		await mkdir(join(SYSTEM_PROMPT_DEBUG_DIR, "conv-1"), {
			recursive: true,
		});
		await writeFile(
			join(SYSTEM_PROMPT_DEBUG_DIR, "conv-1", "msg-trigger-1"),
			"blocking file",
			"utf8"
		);
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		try {
			const { runGenerationRuntime } = await modulePromise;
			const result = await runGenerationRuntime(createInput() as never);

			expect(result.status).toBe("completed");
			expect(
				consoleWarnMock.mock.calls.some(
					(call) =>
						typeof call[0] === "string" &&
						call[0].includes("evt=system_prompt_dump_failed")
				)
			).toBe(true);
		} finally {
			console.warn = originalWarn;
		}
	});

	it("returns error on timeout before any public message without fallback retry", async () => {
		queuedGenerateHandlers.push(async () => {
			throw createAbortError();
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("timeout");
		expect(result.publicMessagesSent).toBe(0);
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts?.[0]).toMatchObject({
			modelId: "moonshotai/kimi-k2.5",
			attempt: 1,
			outcome: "timeout",
		});
		expect(createModelMock.mock.calls.map((call) => call[0])).toEqual([
			"moonshotai/kimi-k2.5",
		]);
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

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("missing_finish_action");
		expect(result.publicMessagesSent).toBe(0);
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts?.[0]?.outcome).toBe("error");
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

	it("fails command completion when main sendMessage was not called", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.respond.execute({
				reasoning: "Handled command without public reply",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				mode: "respond_to_command",
				humanCommand: "Please reply to the visitor",
			}) as never
		);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("runtime_error");
		expect(result.error).toContain("requires sendMessage");
	});
});
