import { env } from "@api/env";
import { generateIdempotentULID, generateULID } from "@api/utils/db/ids";
import {
	createTimelineItem,
	updateTimelineItem,
} from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	getToolLogType,
	isConversationVisibleTool,
	TimelineItemVisibility,
	type ToolTimelineLogType,
} from "@cossistant/types";
import type { ToolExecutionOptions, ToolSet } from "ai";
import {
	buildTracePayloadByMode,
	getToolTracePayloadMode,
	isDeepTraceEnabled,
	markToolTraceCallFinished,
	markToolTraceCallStarted,
} from "../pipeline/trace";
import type { ToolContext, ToolTracePayloadMode } from "./types";

const MAX_SANITIZE_DEPTH = 4;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;
const MAX_SERIALIZED_LENGTH = 6000;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const BEARER_PATTERN = /bearer\s+[A-Za-z0-9._-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;
const DECISION_TOOL_NAME = "aiDecision";
const DECISION_TOOL_CALL_ID = "decision";

export type ToolTimelineContext = Pick<
	ToolContext,
	| "db"
	| "conversationId"
	| "organizationId"
	| "websiteId"
	| "visitorId"
	| "aiAgentId"
	| "triggerMessageId"
	| "workflowRunId"
	| "triggerVisibility"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactString(value: string): string {
	return value
		.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
		.replace(PHONE_PATTERN, "[REDACTED_PHONE]")
		.replace(BEARER_PATTERN, "[REDACTED_BEARER_TOKEN]")
		.replace(JWT_PATTERN, "[REDACTED_JWT]");
}

function truncateString(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function isSensitiveKey(key: string): boolean {
	const normalizedKey = key.toLowerCase();
	const sensitiveKeywords = [
		"token",
		"secret",
		"password",
		"pass",
		"apikey",
		"api_key",
		"authorization",
		"auth",
		"cookie",
		"session",
		"email",
		"phone",
	];

	return sensitiveKeywords.some((keyword) => normalizedKey.includes(keyword));
}

function sanitizeToolDebugValueInternal(
	value: unknown,
	depth: number,
	seen: WeakSet<object>
): unknown {
	if (
		value === null ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (typeof value === "string") {
		return truncateString(redactString(value), MAX_STRING_LENGTH);
	}

	if (typeof value === "undefined") {
		return "[Undefined]";
	}

	if (typeof value === "bigint") {
		return value.toString();
	}

	if (typeof value === "function") {
		return "[Function]";
	}

	if (depth >= MAX_SANITIZE_DEPTH) {
		return "[MaxDepthExceeded]";
	}

	if (Array.isArray(value)) {
		const sanitizedItems = value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => sanitizeToolDebugValueInternal(item, depth + 1, seen));

		if (value.length > MAX_ARRAY_ITEMS) {
			sanitizedItems.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`);
		}

		return sanitizedItems;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "object") {
		if (seen.has(value)) {
			return "[Circular]";
		}

		seen.add(value);

		const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
		const sanitized: Record<string, unknown> = {};

		for (const [key, nestedValue] of entries) {
			if (isSensitiveKey(key)) {
				sanitized[key] = "[REDACTED]";
				continue;
			}

			sanitized[key] = sanitizeToolDebugValueInternal(
				nestedValue,
				depth + 1,
				seen
			);
		}

		if (Object.keys(value).length > MAX_OBJECT_KEYS) {
			sanitized.__truncatedKeys = Object.keys(value).length - MAX_OBJECT_KEYS;
		}

		return sanitized;
	}

	return String(value);
}

function limitSerializedSize(value: unknown): unknown {
	try {
		const serialized = JSON.stringify(value);
		if (!serialized || serialized.length <= MAX_SERIALIZED_LENGTH) {
			return value;
		}

		return {
			truncated: true,
			size: serialized.length,
			preview: `${serialized.slice(0, MAX_SERIALIZED_LENGTH)}...`,
		};
	} catch {
		return "[UnserializableValue]";
	}
}

export function sanitizeToolDebugValue(value: unknown): unknown {
	return limitSerializedSize(
		sanitizeToolDebugValueInternal(value, 0, new WeakSet<object>())
	);
}

function sanitizeToolInput(input: unknown): Record<string, unknown> {
	if (isRecord(input)) {
		return sanitizeToolDebugValue(input) as Record<string, unknown>;
	}

	return {
		value: sanitizeToolDebugValue(input),
	};
}

function summarizeSearchKnowledgeBaseOutput(output: unknown): unknown {
	if (!isRecord(output)) {
		return output;
	}

	const data = isRecord(output.data) ? output.data : null;
	const articles = Array.isArray(data?.articles) ? data.articles : [];

	const summarizedArticles = articles.slice(0, 5).map((article, index) => {
		if (!isRecord(article)) {
			return { index };
		}

		const content = typeof article.content === "string" ? article.content : "";

		return {
			index,
			title:
				typeof article.title === "string" ? redactString(article.title) : null,
			sourceUrl:
				typeof article.sourceUrl === "string"
					? redactString(article.sourceUrl)
					: null,
			sourceType:
				typeof article.sourceType === "string" ? article.sourceType : null,
			similarity:
				typeof article.similarity === "number" ? article.similarity : null,
			snippet: content ? truncateString(redactString(content), 220) : "",
		};
	});

	return {
		success: output.success === true,
		error:
			typeof output.error === "string"
				? truncateString(redactString(output.error), MAX_STRING_LENGTH)
				: null,
		data: {
			query:
				typeof data?.query === "string"
					? truncateString(redactString(data.query), MAX_STRING_LENGTH)
					: null,
			totalFound:
				typeof data?.totalFound === "number"
					? data.totalFound
					: articles.length,
			lowConfidence: data?.lowConfidence === true,
			guidance:
				typeof data?.guidance === "string"
					? truncateString(redactString(data.guidance), MAX_STRING_LENGTH)
					: null,
			articlesCount: articles.length,
			articles: summarizedArticles,
		},
	};
}

function sanitizeToolOutput(toolName: string, output: unknown): unknown {
	if (toolName === "searchKnowledgeBase") {
		return sanitizeToolDebugValue(summarizeSearchKnowledgeBaseOutput(output));
	}

	return sanitizeToolDebugValue(output);
}

function getSearchKnowledgeBaseResultCount(output: unknown): number | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const totalFound = data?.totalFound;
	if (typeof totalFound === "number" && Number.isFinite(totalFound)) {
		return totalFound;
	}

	const articles = Array.isArray(data?.articles) ? data.articles : null;
	if (articles) {
		return articles.length;
	}

	return null;
}

function getTitleFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const titleCandidate =
		typeof data?.title === "string"
			? data.title
			: typeof output.title === "string"
				? output.title
				: null;

	if (!titleCandidate) {
		return null;
	}

	return truncateString(redactString(titleCandidate), 140);
}

function getSentimentFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const sentimentCandidate =
		typeof data?.sentiment === "string"
			? data.sentiment
			: typeof output.sentiment === "string"
				? output.sentiment
				: null;

	if (!sentimentCandidate) {
		return null;
	}

	return truncateString(redactString(sentimentCandidate), 60);
}

function getDecisionSummary(output: unknown): {
	shouldAct?: boolean;
	mode?: string;
	reason?: string;
} {
	if (!isRecord(output)) {
		return {};
	}

	const shouldAct =
		typeof output.shouldAct === "boolean" ? output.shouldAct : undefined;
	const mode = typeof output.mode === "string" ? output.mode : undefined;
	const reason = typeof output.reason === "string" ? output.reason : undefined;

	return {
		shouldAct,
		mode,
		reason,
	};
}

function buildToolSummaryText(params: {
	toolName: string;
	state: "partial" | "result" | "error";
	sanitizedOutput?: unknown;
}): string {
	const { toolName, state, sanitizedOutput } = params;

	if (toolName === "searchKnowledgeBase") {
		if (state === "partial") {
			return "Looking in knowledge base...";
		}

		if (state === "result") {
			const count = getSearchKnowledgeBaseResultCount(sanitizedOutput);
			if (typeof count === "number" && Number.isFinite(count)) {
				return `Found ${count} relevant source${count === 1 ? "" : "s"}`;
			}
			return "Finished knowledge base lookup";
		}

		return "Knowledge base lookup failed";
	}

	if (
		toolName === "updateConversationTitle" ||
		toolName === "setConversationTitle"
	) {
		if (state === "partial") {
			return "Updating conversation title...";
		}

		if (state === "result") {
			const title = getTitleFromToolOutput(sanitizedOutput);
			return title
				? `Updated conversation title to "${title}"`
				: "Updated conversation title";
		}

		return "Failed to update conversation title";
	}

	if (toolName === "updateSentiment") {
		if (state === "partial") {
			return "Updating sentiment...";
		}

		if (state === "result") {
			const sentiment = getSentimentFromToolOutput(sanitizedOutput);
			return sentiment
				? `Updated sentiment to ${sentiment}`
				: "Updated sentiment";
		}

		return "Failed to update sentiment";
	}

	if (toolName === DECISION_TOOL_NAME) {
		if (state === "partial") {
			return "Evaluating whether to act...";
		}

		if (state === "result") {
			const decision = getDecisionSummary(sanitizedOutput);
			if (typeof decision.shouldAct === "boolean" && decision.mode) {
				const action = decision.shouldAct ? "act" : "skip";
				return `Decision: ${action} (${decision.mode})`;
			}
			return "Decision evaluated";
		}

		return "Decision evaluation failed";
	}

	if (state === "partial") {
		return `Running ${toolName}`;
	}

	if (state === "result") {
		return `Completed ${toolName}`;
	}

	return `Failed ${toolName}`;
}

function toErrorText(error: unknown): string {
	if (typeof error === "string") {
		return truncateString(redactString(error), MAX_STRING_LENGTH);
	}

	if (error instanceof Error) {
		return truncateString(redactString(error.message), MAX_STRING_LENGTH);
	}

	return "Tool execution failed";
}

function getTracePayloadModeForContext(
	toolContext: ToolContext
): ToolTracePayloadMode {
	return (
		toolContext.tracePayloadMode ??
		getToolTracePayloadMode(env.AI_AGENT_TRACE_PAYLOAD_MODE)
	);
}

function shouldEmitDeepToolTrace(toolContext: ToolContext): boolean {
	if (toolContext.deepTraceEnabled != null) {
		return isDeepTraceEnabled(toolContext.deepTraceEnabled);
	}
	return isDeepTraceEnabled(env.AI_AGENT_DEEP_TRACE_ENABLED);
}

function emitToolTraceLog(
	toolContext: ToolContext,
	level: "log" | "warn" | "error",
	...args: unknown[]
): void {
	const logger = toolContext.traceLogger;
	if (logger) {
		if (level === "warn") {
			logger.warn(...args);
			return;
		}
		if (level === "error") {
			logger.error(...args);
			return;
		}
		logger.log(...args);
		return;
	}

	if (level === "warn") {
		console.warn(...args);
		return;
	}
	if (level === "error") {
		console.error(...args);
		return;
	}
	console.log(...args);
}

function getFailureTextFromResult(result: unknown): string | null {
	if (!isRecord(result)) {
		return null;
	}

	if ("success" in result && result.success === false) {
		if (typeof result.error === "string" && result.error.length > 0) {
			return toErrorText(result.error);
		}
		return "Tool returned success=false";
	}

	if (
		"success" in result &&
		result.success !== true &&
		typeof result.error === "string" &&
		result.error.length > 0
	) {
		return toErrorText(result.error);
	}

	return null;
}

function getWorkflowRunId(toolContext: ToolTimelineContext): string {
	return toolContext.workflowRunId ?? toolContext.triggerMessageId;
}

function getToolTimelineVisibility(toolName: string): TimelineItemVisibility {
	if (toolName === DECISION_TOOL_NAME) {
		return TimelineItemVisibility.PRIVATE;
	}

	if (isConversationVisibleTool(toolName)) {
		return TimelineItemVisibility.PUBLIC;
	}

	return TimelineItemVisibility.PRIVATE;
}

function getToolTimelineProviderMetadata(params: {
	toolContext: ToolTimelineContext;
	toolName: string;
}): {
	cossistant: {
		visibility: TimelineItemVisibility;
		toolTimeline: {
			logType: ToolTimelineLogType;
			triggerMessageId: string;
			workflowRunId: string;
			triggerVisibility?: "public" | "private";
		};
	};
} {
	const { toolContext, toolName } = params;
	const workflowRunId = getWorkflowRunId(toolContext);
	const visibility = getToolTimelineVisibility(toolName);
	const logType = getToolLogType(toolName);

	return {
		cossistant: {
			visibility,
			toolTimeline: {
				logType,
				triggerMessageId: toolContext.triggerMessageId,
				workflowRunId,
				...(toolContext.triggerVisibility
					? { triggerVisibility: toolContext.triggerVisibility }
					: {}),
			},
		},
	};
}

export function createToolTimelineItemId(params: {
	workflowRunId: string;
	toolCallId: string;
}): string {
	return generateIdempotentULID(
		`tool:${params.workflowRunId}:${params.toolCallId}`
	);
}

function buildToolPart(params: {
	toolContext: ToolTimelineContext;
	toolName: string;
	toolCallId: string;
	state: "partial" | "result" | "error";
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
}): Record<string, unknown> {
	const providerMetadata = getToolTimelineProviderMetadata({
		toolContext: params.toolContext,
		toolName: params.toolName,
	});

	return {
		type: `tool-${params.toolName}`,
		toolCallId: params.toolCallId,
		toolName: params.toolName,
		input: params.input,
		state: params.state,
		callProviderMetadata: providerMetadata,
		providerMetadata,
		...(params.output === undefined ? {} : { output: params.output }),
		...(params.errorText ? { errorText: params.errorText } : {}),
	};
}

function isUniqueViolationError(error: unknown): boolean {
	if (isRecord(error) && typeof error.code === "string") {
		return error.code === "23505";
	}

	if (isRecord(error) && "cause" in error) {
		const cause = error.cause;
		if (isRecord(cause) && typeof cause.code === "string") {
			return cause.code === "23505";
		}
	}

	return false;
}

async function safeCreatePartialToolTimelineItem(params: {
	toolContext: ToolTimelineContext;
	timelineItemId: string;
	toolName: string;
	toolCallId: string;
	sanitizedInput: Record<string, unknown>;
}): Promise<void> {
	const { toolContext, timelineItemId, toolName, toolCallId, sanitizedInput } =
		params;
	const summaryText = buildToolSummaryText({
		toolName,
		state: "partial",
	});

	try {
		await createTimelineItem({
			db: toolContext.db,
			organizationId: toolContext.organizationId,
			websiteId: toolContext.websiteId,
			conversationId: toolContext.conversationId,
			conversationOwnerVisitorId: toolContext.visitorId,
			item: {
				id: timelineItemId,
				type: ConversationTimelineType.TOOL,
				text: summaryText,
				parts: [
					buildToolPart({
						toolContext,
						toolName,
						toolCallId,
						state: "partial",
						input: sanitizedInput,
					}),
				],
				aiAgentId: toolContext.aiAgentId,
				visitorId: toolContext.visitorId,
				visibility: getToolTimelineVisibility(toolName),
				tool: toolName,
			},
		});
	} catch (error) {
		if (isUniqueViolationError(error)) {
			await safeUpdateToolTimelineItem({
				toolContext,
				timelineItemId,
				toolName,
				toolCallId,
				state: "partial",
				sanitizedInput,
			});
			return;
		}

		console.warn(
			`[tool-call-logger] conv=${toolContext.conversationId} | Failed to create tool timeline item for ${toolName}:`,
			error
		);
	}
}

async function safeUpdateToolTimelineItem(params: {
	toolContext: ToolTimelineContext;
	timelineItemId: string;
	toolName: string;
	toolCallId: string;
	state: "partial" | "result" | "error";
	sanitizedInput: Record<string, unknown>;
	sanitizedOutput?: unknown;
	errorText?: string;
}): Promise<void> {
	const {
		toolContext,
		timelineItemId,
		toolName,
		toolCallId,
		state,
		sanitizedInput,
		sanitizedOutput,
		errorText,
	} = params;
	const summaryText = buildToolSummaryText({
		toolName,
		state,
		sanitizedOutput,
	});

	try {
		await updateTimelineItem({
			db: toolContext.db,
			organizationId: toolContext.organizationId,
			websiteId: toolContext.websiteId,
			conversationId: toolContext.conversationId,
			conversationOwnerVisitorId: toolContext.visitorId,
			itemId: timelineItemId,
			item: {
				text: summaryText,
				parts: [
					buildToolPart({
						toolContext,
						toolName,
						toolCallId,
						state,
						input: sanitizedInput,
						output: sanitizedOutput,
						errorText,
					}),
				],
				tool: toolName,
			},
		});
	} catch (error) {
		console.warn(
			`[tool-call-logger] conv=${toolContext.conversationId} | Failed to update tool timeline item ${timelineItemId}:`,
			error
		);
	}
}

type DecisionTimelineResult = {
	shouldAct: boolean;
	mode: "respond_to_visitor" | "respond_to_command" | "background_only";
	reason: string;
};

export async function logDecisionTimelineState(params: {
	toolContext: ToolTimelineContext;
	state: "partial" | "result" | "error";
	result?: DecisionTimelineResult;
	error?: unknown;
}): Promise<void> {
	const { toolContext, state, result, error } = params;

	const workflowRunId = getWorkflowRunId(toolContext);
	const timelineItemId = createToolTimelineItemId({
		workflowRunId,
		toolCallId: DECISION_TOOL_CALL_ID,
	});

	const sanitizedInput = sanitizeToolInput({
		stage: "decision",
		triggerMessageId: toolContext.triggerMessageId,
	});

	if (state === "partial") {
		await safeCreatePartialToolTimelineItem({
			toolContext,
			timelineItemId,
			toolName: DECISION_TOOL_NAME,
			toolCallId: DECISION_TOOL_CALL_ID,
			sanitizedInput,
		});
		return;
	}

	if (state === "result") {
		await safeUpdateToolTimelineItem({
			toolContext,
			timelineItemId,
			toolName: DECISION_TOOL_NAME,
			toolCallId: DECISION_TOOL_CALL_ID,
			state: "result",
			sanitizedInput,
			sanitizedOutput: sanitizeToolOutput(DECISION_TOOL_NAME, result ?? {}),
		});
		return;
	}

	await safeUpdateToolTimelineItem({
		toolContext,
		timelineItemId,
		toolName: DECISION_TOOL_NAME,
		toolCallId: DECISION_TOOL_CALL_ID,
		state: "error",
		sanitizedInput,
		errorText: toErrorText(error),
	});
}

export function wrapToolsWithTimelineLogging(
	tools: ToolSet,
	toolContext: ToolContext
): ToolSet {
	const wrappedTools: ToolSet = {};

	for (const [toolName, toolDefinition] of Object.entries(tools)) {
		if (!toolDefinition.execute) {
			wrappedTools[toolName] = toolDefinition;
			continue;
		}

		const originalExecute = toolDefinition.execute;

		wrappedTools[toolName] = {
			...toolDefinition,
			execute: async (input: unknown, options?: ToolExecutionOptions) => {
				const startedAt = Date.now();
				const toolCallId =
					typeof options?.toolCallId === "string" &&
					options.toolCallId.length > 0
						? options.toolCallId
						: generateULID();

				const workflowRunId = getWorkflowRunId(toolContext);
				const timelineItemId = createToolTimelineItemId({
					workflowRunId,
					toolCallId,
				});
				const sanitizedInput = sanitizeToolInput(input);
				const tracePayloadMode = getTracePayloadModeForContext(toolContext);
				const deepToolTraceEnabled = shouldEmitDeepToolTrace(toolContext);
				markToolTraceCallStarted(toolContext.traceDiagnostics, toolName);
				if (deepToolTraceEnabled) {
					emitToolTraceLog(
						toolContext,
						"log",
						`[ai-agent:trace] conv=${toolContext.conversationId} | tool.call.start | tool=${toolName} | toolCallId=${toolCallId} | payloadMode=${tracePayloadMode}`,
						{
							input: buildTracePayloadByMode({
								mode: tracePayloadMode,
								rawPayload: input,
								sanitizedPayload: sanitizedInput,
							}),
						}
					);
				}

				await safeCreatePartialToolTimelineItem({
					toolContext,
					timelineItemId,
					toolName,
					toolCallId,
					sanitizedInput,
				});

				try {
					const result = await originalExecute(
						input as never,
						options as never
					);
					const failureText = getFailureTextFromResult(result);
					const sanitizedOutput = sanitizeToolOutput(toolName, result);
					const durationMs = Date.now() - startedAt;
					markToolTraceCallFinished(toolContext.traceDiagnostics, toolName);

					if (failureText) {
						if (deepToolTraceEnabled) {
							emitToolTraceLog(
								toolContext,
								"warn",
								`[ai-agent:trace] conv=${toolContext.conversationId} | tool.call.end | tool=${toolName} | toolCallId=${toolCallId} | state=error | durationMs=${durationMs} | payloadMode=${tracePayloadMode}`,
								{
									error: failureText,
									output: buildTracePayloadByMode({
										mode: tracePayloadMode,
										rawPayload: result,
										sanitizedPayload: sanitizedOutput,
									}),
								}
							);
						}
						await safeUpdateToolTimelineItem({
							toolContext,
							timelineItemId,
							toolName,
							toolCallId,
							state: "error",
							sanitizedInput,
							sanitizedOutput,
							errorText: failureText,
						});
					} else {
						if (deepToolTraceEnabled) {
							emitToolTraceLog(
								toolContext,
								"log",
								`[ai-agent:trace] conv=${toolContext.conversationId} | tool.call.end | tool=${toolName} | toolCallId=${toolCallId} | state=result | durationMs=${durationMs} | payloadMode=${tracePayloadMode}`,
								{
									output: buildTracePayloadByMode({
										mode: tracePayloadMode,
										rawPayload: result,
										sanitizedPayload: sanitizedOutput,
									}),
								}
							);
						}
						await safeUpdateToolTimelineItem({
							toolContext,
							timelineItemId,
							toolName,
							toolCallId,
							state: "result",
							sanitizedInput,
							sanitizedOutput,
						});
					}

					return result;
				} catch (error) {
					const durationMs = Date.now() - startedAt;
					markToolTraceCallFinished(toolContext.traceDiagnostics, toolName);
					if (deepToolTraceEnabled) {
						emitToolTraceLog(
							toolContext,
							"error",
							`[ai-agent:trace] conv=${toolContext.conversationId} | tool.call.end | tool=${toolName} | toolCallId=${toolCallId} | state=threw | durationMs=${durationMs} | payloadMode=${tracePayloadMode}`,
							{
								error: toErrorText(error),
								output: buildTracePayloadByMode({
									mode: tracePayloadMode,
									rawPayload: error,
								}),
							}
						);
					}
					await safeUpdateToolTimelineItem({
						toolContext,
						timelineItemId,
						toolName,
						toolCallId,
						state: "error",
						sanitizedInput,
						errorText: toErrorText(error),
					});
					throw error;
				}
			},
		};
	}

	return wrappedTools;
}
