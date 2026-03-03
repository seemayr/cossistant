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

const toolCallLoggerModulePromise = import("./tool-call-logger");

type TestToolContext = {
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
	allowPublicMessages: boolean;
	triggerMessageId: string;
	workflowRunId: string;
	triggerVisibility?: "public" | "private";
	traceDiagnostics?: {
		phase: string;
		toolCallsStarted: number;
		toolCallsFinished: number;
		lastToolName: string | null;
		lastActivityAtMs: number;
		abortReason: string | null;
	};
	traceLogger?: {
		log: (...args: unknown[]) => void;
		warn: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
	deepTraceEnabled?: boolean;
	tracePayloadMode?: "raw" | "sanitized" | "metadata";
};

function createToolContext(
	overrides: Partial<TestToolContext> = {}
): TestToolContext {
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
		allowPublicMessages: true,
		triggerMessageId: "trigger-1",
		workflowRunId: "workflow-1",
		triggerVisibility: "public",
		...overrides,
	};
}

async function executeWrappedTool(
	wrappedTools: Record<
		string,
		{ execute?: (input: unknown, options?: unknown) => Promise<unknown> }
	>,
	toolName: string,
	input: unknown,
	options?: unknown
): Promise<unknown> {
	const execute = wrappedTools[toolName]?.execute;
	if (!execute) {
		throw new Error(`Missing wrapped tool execute: ${toolName}`);
	}

	return execute(input, options);
}

describe("tool-call-logger", () => {
	beforeEach(() => {
		createTimelineItemMock.mockReset();
		updateTimelineItemMock.mockReset();
		createTimelineItemMock.mockResolvedValue({ id: "timeline-1" });
		updateTimelineItemMock.mockResolvedValue({ id: "timeline-1" });
	});

	it("creates partial tool row then updates it to result state", async () => {
		const { createToolTimelineItemId, wrapToolsWithTimelineLogging } =
			await toolCallLoggerModulePromise;

		const executeMock = mock((async () => ({
			success: true,
			data: { sent: true },
		})) as (...args: unknown[]) => Promise<unknown>);

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				sendMessage: {
					execute: executeMock,
				},
			} as never,
			createToolContext() as never
		);

		await executeWrappedTool(
			wrappedTools as never,
			"sendMessage",
			{ message: "Hello visitor" },
			{ toolCallId: "call-1" }
		);

		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);

		const expectedTimelineId = createToolTimelineItemId({
			workflowRunId: "workflow-1",
			toolCallId: "call-1",
		});

		expect(createTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			conversationId: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			item: {
				id: expectedTimelineId,
				type: "tool",
				visibility: "private",
				text: "Running sendMessage",
			},
		});

		const createdPart = (
			createTimelineItemMock.mock.calls[0]?.[0] as {
				item: {
					parts: Array<{
						callProviderMetadata?: {
							cossistant?: {
								toolTimeline?: {
									logType?: string;
									triggerMessageId?: string;
									workflowRunId?: string;
									triggerVisibility?: string;
								};
							};
						};
						providerMetadata?: {
							cossistant?: {
								toolTimeline?: {
									logType?: string;
								};
							};
						};
					}>;
				};
			}
		).item.parts[0];

		expect(
			createdPart?.callProviderMetadata?.cossistant?.toolTimeline
		).toMatchObject({
			logType: "log",
			triggerMessageId: "trigger-1",
			workflowRunId: "workflow-1",
			triggerVisibility: "public",
		});
		expect(
			createdPart?.providerMetadata?.cossistant?.toolTimeline?.logType
		).toBe("log");

		const updatedCall = updateTimelineItemMock.mock.calls[0]?.[0] as {
			item: {
				text?: string;
				parts: Array<{ state?: string }>;
			};
		};
		expect(updatedCall.item.text).toBe("Completed sendMessage");
		const updatedPart = (
			updatedCall as {
				item: { parts: Array<{ state?: string }> };
			}
		).item.parts[0];
		expect(updatedPart?.state).toBe("result");
	});

	it("marks allowlisted tools as public customer-facing timeline rows", async () => {
		const { wrapToolsWithTimelineLogging } = await toolCallLoggerModulePromise;

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				searchKnowledgeBase: {
					execute: async () => ({
						success: true,
						data: { totalFound: 3 },
					}),
				},
			} as never,
			createToolContext() as never
		);

		await executeWrappedTool(
			wrappedTools as never,
			"searchKnowledgeBase",
			{ query: "refund policy" },
			{ toolCallId: "call-public" }
		);

		const createCall = createTimelineItemMock.mock.calls[0]?.[0] as {
			item: {
				visibility: string;
				parts: Array<{
					callProviderMetadata?: {
						cossistant?: {
							visibility?: string;
							toolTimeline?: {
								logType?: string;
							};
						};
					};
				}>;
			};
		};

		expect(createCall.item.visibility).toBe("public");
		expect(
			createCall.item.parts[0]?.callProviderMetadata?.cossistant?.visibility
		).toBe("public");
		expect(
			createCall.item.parts[0]?.callProviderMetadata?.cossistant?.toolTimeline
				?.logType
		).toBe("customer_facing");
	});

	it("logs decision stage as a private decision tool timeline row", async () => {
		const { createToolTimelineItemId, logDecisionTimelineState } =
			await toolCallLoggerModulePromise;

		const toolContext = createToolContext();

		await logDecisionTimelineState({
			toolContext: toolContext as never,
			state: "partial",
		});

		await logDecisionTimelineState({
			toolContext: toolContext as never,
			state: "result",
			result: {
				shouldAct: true,
				mode: "respond_to_visitor",
				reason: "visitor asked for help",
			},
		});

		const expectedTimelineId = createToolTimelineItemId({
			workflowRunId: "workflow-1",
			toolCallId: "decision",
		});

		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(createTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				id: expectedTimelineId,
				type: "tool",
				visibility: "private",
				tool: "aiDecision",
				text: "Evaluating whether to act...",
			},
		});

		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			itemId: expectedTimelineId,
			item: {
				text: "Decision: act (respond_to_visitor)",
				tool: "aiDecision",
				parts: [
					{
						state: "result",
						callProviderMetadata: {
							cossistant: {
								toolTimeline: {
									logType: "decision",
								},
							},
						},
					},
				],
			},
		});
	});

	it("updates decision stage row to error when decision stage fails", async () => {
		const { logDecisionTimelineState } = await toolCallLoggerModulePromise;

		const toolContext = createToolContext();

		await logDecisionTimelineState({
			toolContext: toolContext as never,
			state: "partial",
		});

		await logDecisionTimelineState({
			toolContext: toolContext as never,
			state: "error",
			error: new Error("decision model timed out"),
		});

		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: "Decision evaluation failed",
				parts: [
					{
						state: "error",
						errorText: "decision model timed out",
					},
				],
			},
		});
	});

	it("updates tool row to error state when tool returns success=false", async () => {
		const { wrapToolsWithTimelineLogging } = await toolCallLoggerModulePromise;

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				sendMessage: {
					execute: async () => ({
						success: false,
						error: "Could not send",
					}),
				},
			} as never,
			createToolContext() as never
		);

		await executeWrappedTool(
			wrappedTools as never,
			"sendMessage",
			{ message: "Hello" },
			{ toolCallId: "call-2" }
		);

		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);

		const updatedPart = (
			updateTimelineItemMock.mock.calls[0]?.[0] as {
				item: {
					text?: string;
					parts: Array<{ state?: string; errorText?: string }>;
				};
			}
		).item;
		expect(updatedPart.text).toBe("Failed sendMessage");
		const part = updatedPart.parts[0];
		expect(part?.state).toBe("error");
		expect(part?.errorText).toContain("Could not send");
	});

	it("uses tool-specific summary text for title and sentiment updates", async () => {
		const { wrapToolsWithTimelineLogging } = await toolCallLoggerModulePromise;

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				updateConversationTitle: {
					execute: async () => ({
						success: true,
						data: {
							title: "Refund status request",
						},
					}),
				},
				updateSentiment: {
					execute: async () => ({
						success: true,
						data: {
							sentiment: "negative",
						},
					}),
				},
			} as never,
			createToolContext() as never
		);

		await executeWrappedTool(
			wrappedTools as never,
			"updateConversationTitle",
			{ title: "Refund status request" },
			{ toolCallId: "call-title" }
		);

		expect(createTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: "Updating conversation title...",
			},
		});
		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: 'Updated conversation title to "Refund status request"',
			},
		});

		createTimelineItemMock.mockClear();
		updateTimelineItemMock.mockClear();

		await executeWrappedTool(
			wrappedTools as never,
			"updateSentiment",
			{ sentiment: "negative" },
			{ toolCallId: "call-sentiment" }
		);

		expect(createTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: "Updating sentiment...",
			},
		});
		expect(updateTimelineItemMock.mock.calls[0]?.[0]).toMatchObject({
			item: {
				text: "Updated sentiment to negative",
			},
		});
	});

	it("updates tool row to error state when execute throws", async () => {
		const { wrapToolsWithTimelineLogging } = await toolCallLoggerModulePromise;

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				searchKnowledgeBase: {
					execute: async () => {
						throw new Error("boom");
					},
				},
			} as never,
			createToolContext() as never
		);

		await expect(
			executeWrappedTool(
				wrappedTools as never,
				"searchKnowledgeBase",
				{ query: "pricing" },
				{ toolCallId: "call-3" }
			)
		).rejects.toThrow("boom");

		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		const updatedCall = updateTimelineItemMock.mock.calls[0]?.[0] as {
			item: {
				text?: string;
				parts: Array<{ state?: string; errorText?: string }>;
			};
		};
		expect(updatedCall.item.text).toBe("Knowledge base lookup failed");
		const updatedPart = updatedCall.item.parts[0];
		expect(updatedPart?.state).toBe("error");
		expect(updatedPart?.errorText).toContain("boom");
	});

	it("is fail-open when timeline logging fails", async () => {
		const { wrapToolsWithTimelineLogging } = await toolCallLoggerModulePromise;
		createTimelineItemMock.mockRejectedValue(new Error("timeline unavailable"));

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				respond: {
					execute: async () => ({ success: true, action: "respond" }),
				},
			} as never,
			createToolContext() as never
		);

		const result = await executeWrappedTool(
			wrappedTools as never,
			"respond",
			{ reasoning: "done", confidence: 1 },
			{ toolCallId: "call-4" }
		);

		expect(result).toMatchObject({ success: true, action: "respond" });
	});

	it("redacts sensitive fields and summarizes large searchKnowledgeBase results", async () => {
		const { sanitizeToolDebugValue, wrapToolsWithTimelineLogging } =
			await toolCallLoggerModulePromise;

		const sanitized = sanitizeToolDebugValue({
			email: "jack@example.com",
			password: "123456",
			profile: {
				phone: "+1 (415) 555-1212",
			},
		});

		expect(sanitized).toMatchObject({
			email: "[REDACTED]",
			password: "[REDACTED]",
			profile: {
				phone: "[REDACTED]",
			},
		});

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				searchKnowledgeBase: {
					execute: async () => ({
						success: true,
						data: {
							query: "pricing",
							articles: [
								{
									title: "Pricing Guide",
									sourceUrl: "https://acme.dev/pricing",
									sourceType: "article",
									similarity: 0.91,
									content: "A".repeat(6000),
								},
							],
						},
					}),
				},
			} as never,
			createToolContext() as never
		);

		await executeWrappedTool(
			wrappedTools as never,
			"searchKnowledgeBase",
			{ query: "pricing" },
			{ toolCallId: "call-5" }
		);

		expect(createTimelineItemMock.mock.calls.at(-1)?.[0]).toMatchObject({
			item: {
				text: "Looking in knowledge base...",
			},
		});
		expect(updateTimelineItemMock.mock.calls.at(-1)?.[0]).toMatchObject({
			item: {
				text: "Found 1 relevant source",
			},
		});

		const updatedPart = (
			updateTimelineItemMock.mock.calls.at(-1)?.[0] as {
				item: {
					parts: Array<{
						state?: string;
						output?: {
							data?: {
								articles?: Array<{ snippet?: string }>;
							};
						};
					}>;
				};
			}
		).item.parts[0];

		expect(updatedPart?.state).toBe("result");
		const snippet = updatedPart?.output?.data?.articles?.[0]?.snippet ?? "";
		expect(snippet.length).toBeLessThanOrEqual(260);
	});

	it("emits deep trace logs for tool start/end with configured payload mode", async () => {
		const { wrapToolsWithTimelineLogging } = await toolCallLoggerModulePromise;
		const traceLog = mock((() => {}) as (...args: unknown[]) => void);
		const traceWarn = mock((() => {}) as (...args: unknown[]) => void);
		const traceError = mock((() => {}) as (...args: unknown[]) => void);
		const diagnostics: NonNullable<TestToolContext["traceDiagnostics"]> = {
			phase: "generation_waiting_model",
			toolCallsStarted: 0,
			toolCallsFinished: 0,
			lastToolName: null,
			lastActivityAtMs: Date.now(),
			abortReason: null,
		};

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				searchKnowledgeBase: {
					execute: async () => ({
						success: true,
						data: {
							totalFound: 2,
							articles: [{ title: "A" }, { title: "B" }],
						},
					}),
				},
			} as never,
			createToolContext({
				traceDiagnostics: diagnostics,
				traceLogger: {
					log: traceLog,
					warn: traceWarn,
					error: traceError,
				},
				deepTraceEnabled: true,
				tracePayloadMode: "metadata",
			}) as never
		);

		await executeWrappedTool(
			wrappedTools as never,
			"searchKnowledgeBase",
			{ query: "refund policy" },
			{ toolCallId: "call-trace-1" }
		);

		expect(traceWarn).toHaveBeenCalledTimes(0);
		expect(traceError).toHaveBeenCalledTimes(0);
		expect(traceLog).toHaveBeenCalledTimes(2);
		expect(String(traceLog.mock.calls[0]?.[0])).toContain("tool.call.start");
		expect(String(traceLog.mock.calls[1]?.[0])).toContain("tool.call.end");
		expect(String(traceLog.mock.calls[1]?.[0])).toContain(
			"payloadMode=metadata"
		);
		expect(diagnostics.toolCallsStarted).toBe(1);
		expect(diagnostics.toolCallsFinished).toBe(1);
		expect(diagnostics.lastToolName).toBe("searchKnowledgeBase");
	});

	it("does not emit deep trace logs when deep trace is disabled", async () => {
		const { wrapToolsWithTimelineLogging } = await toolCallLoggerModulePromise;
		const traceLog = mock((() => {}) as (...args: unknown[]) => void);
		const traceWarn = mock((() => {}) as (...args: unknown[]) => void);
		const traceError = mock((() => {}) as (...args: unknown[]) => void);

		const wrappedTools = wrapToolsWithTimelineLogging(
			{
				searchKnowledgeBase: {
					execute: async () => ({
						success: true,
						data: { totalFound: 1 },
					}),
				},
			} as never,
			createToolContext({
				traceLogger: {
					log: traceLog,
					warn: traceWarn,
					error: traceError,
				},
				deepTraceEnabled: false,
			}) as never
		);

		await executeWrappedTool(
			wrappedTools as never,
			"searchKnowledgeBase",
			{ query: "refund policy" },
			{ toolCallId: "call-trace-off-1" }
		);

		expect(traceLog).toHaveBeenCalledTimes(0);
		expect(traceWarn).toHaveBeenCalledTimes(0);
		expect(traceError).toHaveBeenCalledTimes(0);
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
	});
});
