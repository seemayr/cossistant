import { beforeEach, describe, expect, it, mock } from "bun:test";

const createTimelineItemMock = mock((async () => ({ id: "timeline-1" })) as (
	...args: unknown[]
) => Promise<unknown>);
const updateTimelineItemMock = mock((async () => ({ id: "timeline-1" })) as (
	...args: unknown[]
) => Promise<unknown>);
const emitPipelineToolProgressMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
	updateTimelineItem: updateTimelineItemMock,
}));

mock.module("../events/progress", () => ({
	emitPipelineToolProgress: emitPipelineToolProgressMock,
}));

const modulePromise = import("./telemetry");

type TestContext = {
	db: object;
	conversation: {
		id: string;
		organizationId: string;
		websiteId: string;
		visitorId: string;
	};
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	aiAgentId: string;
	aiAgentName: string;
	visitorName: string;
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
	allowPublicMessages: boolean;
	pipelineKind: "primary" | "background";
	mode: "respond_to_visitor" | "respond_to_command" | "background_only";
	isEscalated: boolean;
	runtimeState: {
		finalAction: null;
		publicMessagesSent: number;
		toolCallCounts: Record<string, number>;
		mutationToolCallCounts: Record<string, number>;
		successfulToolCallCounts: Record<string, number>;
		failedToolCallCounts: Record<string, number>;
		chargeableToolCallCounts: Record<string, number>;
		toolExecutions: Array<{
			toolName: string;
			state: "result" | "error";
			input: Record<string, unknown>;
			output?: unknown;
			errorText?: string;
		}>;
		immediateKnowledgeGapClarificationHandled: boolean;
		publicSendSequence: number;
		privateSendSequence: number;
		sentPublicMessageIds: Set<string>;
		lastToolError: null;
	};
	debugLogger?: {
		log: (...args: unknown[]) => void;
		warn: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
	deepTraceEnabled?: boolean;
	tracePayloadMode?: "raw" | "sanitized" | "metadata";
};

function createContext(overrides: Partial<TestContext> = {}): TestContext {
	return {
		db: {},
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
		},
		conversationId: "conv-1",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		aiAgentName: "Agent",
		visitorName: "Visitor",
		workflowRunId: "wf-1",
		triggerMessageId: "trigger-1",
		triggerVisibility: "public",
		allowPublicMessages: true,
		pipelineKind: "primary",
		mode: "respond_to_visitor",
		isEscalated: false,
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

describe("wrapPipelineToolsWithTelemetry", () => {
	beforeEach(() => {
		createTimelineItemMock.mockReset();
		updateTimelineItemMock.mockReset();
		emitPipelineToolProgressMock.mockReset();
		createTimelineItemMock.mockResolvedValue({ id: "timeline-1" });
		updateTimelineItemMock.mockResolvedValue({ id: "timeline-1" });
		emitPipelineToolProgressMock.mockResolvedValue(undefined);
	});

	it("creates partial state and updates to result with progress events", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;
		const context = createContext();
		const tools = wrapPipelineToolsWithTelemetry({
			tools: {
				sendMessage: {
					execute: async () => ({ success: true, data: { created: true } }),
				},
			} as never,
			context: context as never,
			definitions: [
				{
					id: "sendMessage",
					factory: (() => null) as never,
					availability: { primary: true, background: false, publicOnly: true },
					behaviorSettingKey: null,
					telemetry: {
						summary: {
							partial: "Sending message...",
							result: "Message sent",
							error: "Message failed",
						},
						progress: {
							partial: "Sending message...",
							result: "Message sent",
							error: "Message failed",
							audience: "all",
						},
					},
				},
			] as never,
		});

		await tools.sendMessage?.execute?.(
			{ message: "hello" } as never,
			{ toolCallId: "call-1" } as never
		);

		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(emitPipelineToolProgressMock).toHaveBeenCalledTimes(2);
		expect(context.runtimeState.toolCallCounts.sendMessage).toBe(1);
		expect(context.runtimeState.successfulToolCallCounts.sendMessage).toBe(1);
		expect(context.runtimeState.chargeableToolCallCounts.sendMessage).toBe(1);
		expect(
			context.runtimeState.failedToolCallCounts.sendMessage
		).toBeUndefined();
		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: "Message sent",
				parts: [{ state: "result" }],
			},
		});
	});

	it("marks tool call as failed when result success=false", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;
		const context = createContext();
		const tools = wrapPipelineToolsWithTelemetry({
			tools: {
				setPriority: {
					execute: async () => ({ success: false, error: "not allowed" }),
				},
			} as never,
			context: context as never,
			definitions: [
				{
					id: "setPriority",
					factory: (() => null) as never,
					availability: { primary: true, background: true },
					behaviorSettingKey: "canSetPriority",
					telemetry: {
						summary: {
							partial: "Setting priority...",
							result: "Priority set",
							error: "Priority failed",
						},
						progress: {
							partial: "Setting priority...",
							result: "Priority set",
							error: "Priority failed",
							audience: "dashboard",
						},
					},
				},
			] as never,
		});

		await tools.setPriority?.execute?.(
			{ priority: "high" } as never,
			{ toolCallId: "call-2" } as never
		);

		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: "Priority failed",
				parts: [{ state: "error", errorText: "not allowed" }],
			},
		});
		expect(context.runtimeState.failedToolCallCounts.setPriority).toBe(1);
		expect(
			context.runtimeState.chargeableToolCallCounts.setPriority
		).toBeUndefined();
	});

	it("updates timeline to error when execute throws", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;
		const context = createContext();
		const tools = wrapPipelineToolsWithTelemetry({
			tools: {
				searchKnowledgeBase: {
					execute: async () => {
						throw new Error("boom");
					},
				},
			} as never,
			context: context as never,
			definitions: [
				{
					id: "searchKnowledgeBase",
					factory: (() => null) as never,
					availability: { primary: true, background: true },
					behaviorSettingKey: null,
					telemetry: {
						summary: {
							partial: "Searching...",
							result: "Done",
							error: "Failed",
						},
						progress: {
							partial: "Searching...",
							result: "Done",
							error: "Failed",
							audience: "all",
						},
					},
				},
			] as never,
		});

		await expect(
			tools.searchKnowledgeBase?.execute?.(
				{ query: "pricing" } as never,
				{ toolCallId: "call-3" } as never
			)
		).rejects.toThrow("boom");

		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				parts: [{ state: "error", errorText: "boom" }],
			},
		});
		expect(context.runtimeState.failedToolCallCounts.searchKnowledgeBase).toBe(
			1
		);
	});

	it("suppresses duplicate background one-shot tool calls before timeline emission", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;
		const context = createContext({
			pipelineKind: "background",
			mode: "background_only",
			allowPublicMessages: false,
		});
		const tools = wrapPipelineToolsWithTelemetry({
			tools: {
				setPriority: {
					execute: async () => ({
						success: true,
						changed: true,
						data: { changed: true, priority: "high" },
					}),
				},
			} as never,
			context: context as never,
			definitions: [
				{
					id: "setPriority",
					factory: (() => null) as never,
					availability: { primary: false, background: true },
					behaviorSettingKey: "canSetPriority",
					telemetry: {
						summary: {
							partial: "Setting priority...",
							result: "Priority set",
							error: "Priority failed",
						},
						progress: {
							partial: "Setting priority...",
							result: "Priority set",
							error: "Priority failed",
							audience: "dashboard",
						},
					},
				},
			] as never,
		});

		const firstResult = await tools.setPriority?.execute?.(
			{ priority: "high" } as never,
			{ toolCallId: "call-bg-1" } as never
		);
		const secondResult = await tools.setPriority?.execute?.(
			{ priority: "high" } as never,
			{ toolCallId: "call-bg-2" } as never
		);

		expect(firstResult).toMatchObject({
			success: true,
			changed: true,
		});
		expect(secondResult).toEqual({
			success: true,
			changed: false,
			data: {
				changed: false,
				reason: "duplicate_in_run",
			},
		});
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(emitPipelineToolProgressMock).toHaveBeenCalledTimes(2);
		expect(context.runtimeState.toolCallCounts.setPriority).toBe(1);
		expect(context.runtimeState.toolExecutions).toHaveLength(1);
	});

	it("tracks searchKnowledgeBase partial/result text with source count", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;
		const context = createContext();
		const tools = wrapPipelineToolsWithTelemetry({
			tools: {
				searchKnowledgeBase: {
					execute: async () => ({
						success: true,
						data: {
							totalFound: 2,
							articles: [{ id: "a1" }, { id: "a2" }],
						},
					}),
				},
			} as never,
			context: context as never,
			definitions: [
				{
					id: "searchKnowledgeBase",
					factory: (() => null) as never,
					availability: { primary: true, background: true },
					behaviorSettingKey: null,
					telemetry: {
						summary: {
							partial: "Looking in knowledge base...",
							result: ({ output }: { output?: unknown }) => {
								if (
									output &&
									typeof output === "object" &&
									"data" in output &&
									output.data &&
									typeof output.data === "object" &&
									"totalFound" in output.data &&
									typeof output.data.totalFound === "number"
								) {
									const count = output.data.totalFound;
									return `Found ${count} relevant source${count === 1 ? "" : "s"}`;
								}
								return "Finished knowledge base lookup";
							},
							error: "Knowledge base lookup failed",
						},
						progress: {
							partial: "Searching knowledge base...",
							result: "Done searching knowledge base",
							error: "Search failed",
							audience: "all",
						},
					},
				},
			] as never,
		});

		await tools.searchKnowledgeBase?.execute?.(
			{ query: "pricing" } as never,
			{ toolCallId: "call-search" } as never
		);

		expect(createTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: "Looking in knowledge base...",
				parts: [{ state: "partial" }],
			},
		});
		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: "Found 2 relevant sources",
				parts: [{ state: "result" }],
			},
		});
		expect(emitPipelineToolProgressMock).toHaveBeenCalledTimes(2);
	});

	it("is fail-open when progress emitter fails", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;
		emitPipelineToolProgressMock.mockRejectedValue(
			new Error("progress offline")
		);
		const context = createContext();
		const tools = wrapPipelineToolsWithTelemetry({
			tools: {
				respond: {
					execute: async () => ({ success: true }),
				},
			} as never,
			context: context as never,
			definitions: [
				{
					id: "respond",
					factory: (() => null) as never,
					availability: { primary: true, background: false, publicOnly: true },
					behaviorSettingKey: null,
					telemetry: {
						summary: {
							partial: "Responding...",
							result: "Responded",
							error: "Failed response",
						},
						progress: {
							partial: "Responding...",
							result: "Responded",
							error: "Failed response",
							audience: "all",
						},
					},
				},
			] as never,
		});

		const result = await tools.respond?.execute?.(
			{ reasoning: "ok", confidence: 1 } as never,
			{ toolCallId: "call-progress-fail" } as never
		);

		expect(result).toMatchObject({ success: true });
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(context.runtimeState.successfulToolCallCounts.respond).toBe(1);
	});

	it("forces background progress updates to dashboard audience", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;
		const context = createContext({
			pipelineKind: "background",
			mode: "background_only",
			allowPublicMessages: false,
		});
		const tools = wrapPipelineToolsWithTelemetry({
			tools: {
				searchKnowledgeBase: {
					execute: async () => ({ success: true }),
				},
			} as never,
			context: context as never,
			definitions: [
				{
					id: "searchKnowledgeBase",
					factory: (() => null) as never,
					availability: { primary: true, background: true },
					behaviorSettingKey: null,
					telemetry: {
						summary: {
							partial: "Searching...",
							result: "Done",
							error: "Failed",
						},
						progress: {
							partial: "Searching...",
							result: "Done",
							error: "Failed",
							audience: "all",
						},
					},
				},
			] as never,
		});

		await tools.searchKnowledgeBase?.execute?.(
			{ query: "billing" } as never,
			{ toolCallId: "call-background" } as never
		);

		expect(emitPipelineToolProgressMock).toHaveBeenCalledTimes(2);
		for (const call of emitPipelineToolProgressMock.mock.calls) {
			expect(call[0]).toMatchObject({ audience: "dashboard" });
		}
	});

	it("is fail-open when timeline creation fails", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;
		createTimelineItemMock.mockRejectedValue(new Error("timeline offline"));
		const context = createContext();
		const tools = wrapPipelineToolsWithTelemetry({
			tools: {
				respond: {
					execute: async () => ({ success: true }),
				},
			} as never,
			context: context as never,
			definitions: [
				{
					id: "respond",
					factory: (() => null) as never,
					availability: { primary: true, background: false, publicOnly: true },
					behaviorSettingKey: null,
					telemetry: {
						summary: {
							partial: "Responding...",
							result: "Responded",
							error: "Failed response",
						},
						progress: {
							partial: "Responding...",
							result: "Responded",
							error: "Failed response",
							audience: "all",
						},
					},
				},
			] as never,
		});

		const result = await tools.respond?.execute?.(
			{ reasoning: "ok", confidence: 1 } as never,
			{ toolCallId: "call-4" } as never
		);

		expect(result).toMatchObject({ success: true });
		expect(context.runtimeState.successfulToolCallCounts.respond).toBe(1);
	});

	it("emits trace payloads according to tracePayloadMode", async () => {
		const { wrapPipelineToolsWithTelemetry } = await modulePromise;

		const runWithMode = async (mode: "raw" | "sanitized" | "metadata") => {
			const logSpy = mock(() => {});
			const warnSpy = mock(() => {});
			const errorSpy = mock(() => {});
			const context = createContext({
				deepTraceEnabled: true,
				tracePayloadMode: mode,
				debugLogger: {
					log: logSpy,
					warn: warnSpy,
					error: errorSpy,
				},
			});
			const tools = wrapPipelineToolsWithTelemetry({
				tools: {
					respond: {
						execute: async () => ({
							success: true,
							data: {
								email: "visitor@example.com",
								token: "secret-token",
								value: "ok",
							},
						}),
					},
				} as never,
				context: context as never,
				definitions: [
					{
						id: "respond",
						factory: (() => null) as never,
						availability: {
							primary: true,
							background: false,
							publicOnly: true,
						},
						behaviorSettingKey: null,
						telemetry: {
							summary: {
								partial: "Responding...",
								result: "Responded",
								error: "Failed response",
							},
							progress: {
								partial: "Responding...",
								result: "Responded",
								error: "Failed response",
								audience: "all",
							},
						},
					},
				] as never,
			});

			await tools.respond?.execute?.(
				{
					reasoning: "ok",
					confidence: 1,
					email: "visitor@example.com",
					token: "secret-token",
				} as never,
				{ toolCallId: `call-${mode}` } as never
			);

			const startCall = logSpy.mock.calls.find((call) => {
				const [message] = call as unknown[];
				return String(message).includes("evt=start");
			}) as unknown[] | undefined;
			const endCall = logSpy.mock.calls.find((call) => {
				const [message] = call as unknown[];
				return String(message).includes("evt=end state=result");
			}) as unknown[] | undefined;
			const startPayload = startCall?.[1] as { input?: unknown } | undefined;
			const endPayload = endCall?.[1] as { output?: unknown } | undefined;

			return {
				startPayload: startPayload?.input,
				endPayload: endPayload?.output,
			};
		};

		const raw = await runWithMode("raw");
		const sanitized = await runWithMode("sanitized");
		const metadata = await runWithMode("metadata");

		expect(raw.startPayload).toMatchObject({
			email: "visitor@example.com",
			token: "secret-token",
		});
		expect(sanitized.startPayload).toMatchObject({
			email: "[REDACTED]",
			token: "[REDACTED]",
		});
		expect(metadata.startPayload).toMatchObject({
			kind: "object",
		});

		expect(raw.endPayload).toMatchObject({
			data: {
				email: "visitor@example.com",
				token: "secret-token",
			},
		});
		expect(sanitized.endPayload).toMatchObject({
			data: {
				email: "[REDACTED]",
				token: "[REDACTED]",
			},
		});
		expect(metadata.endPayload).toMatchObject({
			kind: "object",
		});
	});
});
