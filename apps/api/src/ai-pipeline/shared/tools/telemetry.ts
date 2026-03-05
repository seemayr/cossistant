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
	emitPipelineToolProgress,
	type PipelineToolProgressAudience,
} from "../events/progress";
import type {
	PipelineToolContext,
	PipelineToolDefinition,
	ToolTelemetrySpec,
	ToolTracePayloadMode,
} from "./contracts";

const MAX_SANITIZE_DEPTH = 4;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;
const MAX_SERIALIZED_LENGTH = 6000;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const BEARER_PATTERN = /bearer\s+[A-Za-z0-9._-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;

type ToolTimelineContext = Pick<
	PipelineToolContext,
	| "db"
	| "conversation"
	| "conversationId"
	| "organizationId"
	| "websiteId"
	| "visitorId"
	| "aiAgentId"
	| "triggerMessageId"
	| "workflowRunId"
	| "triggerVisibility"
>;

type ToolTelemetryTextParams = {
	toolName: string;
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
};

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

function sanitizeToolInputDefault(input: unknown): Record<string, unknown> {
	if (isRecord(input)) {
		return sanitizeToolDebugValue(input) as Record<string, unknown>;
	}

	return {
		value: sanitizeToolDebugValue(input),
	};
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

function getToolTimelineVisibility(toolName: string): TimelineItemVisibility {
	return isConversationVisibleTool(toolName)
		? TimelineItemVisibility.PUBLIC
		: TimelineItemVisibility.PRIVATE;
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
	const visibility = getToolTimelineVisibility(toolName);
	const logType = getToolLogType(toolName);

	return {
		cossistant: {
			visibility,
			toolTimeline: {
				logType,
				triggerMessageId: toolContext.triggerMessageId,
				workflowRunId: toolContext.workflowRunId,
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

function resolveTelemetryText(
	template: ToolTelemetrySpec["summary"]["partial"] | undefined,
	params: ToolTelemetryTextParams,
	fallback: string
): string {
	if (!template) {
		return fallback;
	}

	if (typeof template === "function") {
		const resolved = template(params);
		return resolved.trim().length > 0 ? resolved : fallback;
	}

	return template.trim().length > 0 ? template : fallback;
}

function buildToolSummaryText(params: {
	telemetry: ToolTelemetrySpec;
	toolName: string;
	state: "partial" | "result" | "error";
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
}): string {
	const { telemetry, toolName, state, input, output, errorText } = params;
	const defaultText =
		state === "partial"
			? `Running ${toolName}`
			: state === "result"
				? `Completed ${toolName}`
				: `Failed ${toolName}`;
	const template =
		state === "partial"
			? telemetry.summary.partial
			: state === "result"
				? telemetry.summary.result
				: telemetry.summary.error;

	return resolveTelemetryText(
		template,
		{
			toolName,
			input,
			output,
			errorText,
		},
		defaultText
	);
}

function resolveProgressAudience(params: {
	telemetry: ToolTelemetrySpec;
	toolName: string;
}): PipelineToolProgressAudience {
	const configuredAudience = params.telemetry.progress.audience ?? "auto";
	if (configuredAudience === "all" || configuredAudience === "dashboard") {
		return configuredAudience;
	}

	return isConversationVisibleTool(params.toolName) ? "all" : "dashboard";
}

function buildToolProgressText(params: {
	telemetry: ToolTelemetrySpec;
	toolName: string;
	state: "partial" | "result" | "error";
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
}): string | null {
	const { telemetry, toolName, state, input, output, errorText } = params;
	const template =
		state === "partial"
			? telemetry.progress.partial
			: state === "result"
				? telemetry.progress.result
				: telemetry.progress.error;
	if (!template) {
		return null;
	}

	const fallback = buildToolSummaryText({
		telemetry,
		toolName,
		state,
		input,
		output,
		errorText,
	});

	return resolveTelemetryText(
		template,
		{
			toolName,
			input,
			output,
			errorText,
		},
		fallback
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
		state: params.state,
		input: params.input,
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

function emitStructuredToolLog(
	context: PipelineToolContext,
	level: "log" | "warn" | "error",
	message: string,
	payload?: unknown
): void {
	const logger = context.debugLogger;
	const output = payload === undefined ? [message] : [message, payload];

	if (logger) {
		if (level === "warn") {
			logger.warn(...output);
			return;
		}
		if (level === "error") {
			logger.error(...output);
			return;
		}
		logger.log(...output);
		return;
	}

	if (level === "warn") {
		console.warn(...output);
		return;
	}
	if (level === "error") {
		console.error(...output);
		return;
	}
	console.log(...output);
}

function toMetadataPayload(value: unknown): Record<string, unknown> {
	if (value === null) {
		return { kind: "null" };
	}

	if (Array.isArray(value)) {
		return {
			kind: "array",
			length: value.length,
		};
	}

	switch (typeof value) {
		case "string":
			return { kind: "string", length: value.length };
		case "number":
		case "boolean":
			return { kind: typeof value };
		case "undefined":
			return { kind: "undefined" };
		case "function":
			return { kind: "function" };
		case "bigint":
			return { kind: "bigint", value: value.toString() };
		case "object": {
			const keys = Object.keys(value as Record<string, unknown>);
			return {
				kind: "object",
				keys: keys.length,
				sampleKeys: keys.slice(0, 12),
			};
		}
		default:
			return { kind: "unknown" };
	}
}

function buildTracePayloadByMode(params: {
	mode: ToolTracePayloadMode;
	rawPayload: unknown;
	sanitizedPayload?: unknown;
}): unknown {
	switch (params.mode) {
		case "raw":
			return params.rawPayload;
		case "metadata":
			return toMetadataPayload(params.rawPayload);
		default:
			return params.sanitizedPayload ?? params.rawPayload;
	}
}

function shouldTreatAsFailure(result: unknown): boolean {
	if (!isRecord(result)) {
		return false;
	}

	if ("success" in result && result.success === false) {
		return true;
	}

	return (
		"success" in result &&
		result.success !== true &&
		typeof result.error === "string" &&
		result.error.length > 0
	);
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

function incrementCount(
	counts: Record<string, number>,
	toolName: string
): void {
	counts[toolName] = (counts[toolName] ?? 0) + 1;
}

async function safeCreatePartialToolTimelineItem(params: {
	context: PipelineToolContext;
	toolName: string;
	telemetry: ToolTelemetrySpec;
	toolCallId: string;
	timelineItemId: string;
	sanitizedInput: Record<string, unknown>;
}): Promise<void> {
	const {
		context,
		toolName,
		telemetry,
		toolCallId,
		timelineItemId,
		sanitizedInput,
	} = params;

	const summaryText = buildToolSummaryText({
		telemetry,
		toolName,
		state: "partial",
		input: sanitizedInput,
	});

	try {
		await createTimelineItem({
			db: context.db,
			organizationId: context.organizationId,
			websiteId: context.websiteId,
			conversationId: context.conversationId,
			conversationOwnerVisitorId: context.visitorId,
			item: {
				id: timelineItemId,
				type: ConversationTimelineType.TOOL,
				text: summaryText,
				parts: [
					buildToolPart({
						toolContext: context,
						toolName,
						toolCallId,
						state: "partial",
						input: sanitizedInput,
					}),
				],
				aiAgentId: context.aiAgentId,
				visitorId: context.visitorId,
				visibility: getToolTimelineVisibility(toolName),
				tool: toolName,
			},
		});
	} catch (error) {
		if (!isUniqueViolationError(error)) {
			emitStructuredToolLog(
				context,
				"warn",
				`[ai-pipeline:tool] conv=${context.conversationId} workflowRunId=${context.workflowRunId} tool=${toolName} evt=timeline_partial_create_failed`,
				error
			);
			return;
		}

		await safeUpdateToolTimelineItem({
			context,
			toolName,
			telemetry,
			toolCallId,
			timelineItemId,
			state: "partial",
			sanitizedInput,
		});
	}
}

async function safeUpdateToolTimelineItem(params: {
	context: PipelineToolContext;
	toolName: string;
	telemetry: ToolTelemetrySpec;
	toolCallId: string;
	timelineItemId: string;
	state: "partial" | "result" | "error";
	sanitizedInput: Record<string, unknown>;
	sanitizedOutput?: unknown;
	errorText?: string;
}): Promise<void> {
	const {
		context,
		toolName,
		telemetry,
		toolCallId,
		timelineItemId,
		state,
		sanitizedInput,
		sanitizedOutput,
		errorText,
	} = params;

	const summaryText = buildToolSummaryText({
		telemetry,
		toolName,
		state,
		input: sanitizedInput,
		output: sanitizedOutput,
		errorText,
	});

	try {
		await updateTimelineItem({
			db: context.db,
			organizationId: context.organizationId,
			websiteId: context.websiteId,
			conversationId: context.conversationId,
			conversationOwnerVisitorId: context.visitorId,
			itemId: timelineItemId,
			item: {
				text: summaryText,
				parts: [
					buildToolPart({
						toolContext: context,
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
		emitStructuredToolLog(
			context,
			"warn",
			`[ai-pipeline:tool] conv=${context.conversationId} workflowRunId=${context.workflowRunId} tool=${toolName} evt=timeline_update_failed`,
			error
		);
	}
}

async function safeEmitToolProgress(params: {
	context: PipelineToolContext;
	toolName: string;
	toolCallId: string;
	telemetry: ToolTelemetrySpec;
	state: "partial" | "result" | "error";
	sanitizedInput: Record<string, unknown>;
	sanitizedOutput?: unknown;
	errorText?: string;
}): Promise<void> {
	const {
		context,
		toolName,
		toolCallId,
		telemetry,
		state,
		sanitizedInput,
		sanitizedOutput,
		errorText,
	} = params;

	const progressMessage = buildToolProgressText({
		telemetry,
		toolName,
		state,
		input: sanitizedInput,
		output: sanitizedOutput,
		errorText,
	});

	try {
		await emitPipelineToolProgress({
			conversation: context.conversation,
			aiAgentId: context.aiAgentId,
			workflowRunId: context.workflowRunId,
			toolCallId,
			toolName,
			state,
			progressMessage,
			audience: resolveProgressAudience({ telemetry, toolName }),
		});
	} catch (error) {
		emitStructuredToolLog(
			context,
			"warn",
			`[ai-pipeline:tool] conv=${context.conversationId} workflowRunId=${context.workflowRunId} tool=${toolName} evt=progress_emit_failed`,
			error
		);
	}
}

function getTelemetryForTool(params: {
	toolName: string;
	definitionsByToolName: Map<string, PipelineToolDefinition>;
}): ToolTelemetrySpec | null {
	return params.definitionsByToolName.get(params.toolName)?.telemetry ?? null;
}

export function wrapPipelineToolsWithTelemetry(params: {
	tools: ToolSet;
	context: PipelineToolContext;
	definitions: readonly PipelineToolDefinition[];
}): ToolSet {
	const wrappedTools: ToolSet = {};
	const definitionsByToolName = new Map(
		params.definitions.map((definition) => [definition.id, definition])
	);

	for (const [toolName, toolDefinition] of Object.entries(params.tools)) {
		if (!toolDefinition.execute) {
			wrappedTools[toolName] = toolDefinition;
			continue;
		}

		const telemetry = getTelemetryForTool({
			toolName,
			definitionsByToolName,
		});
		if (!telemetry) {
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
				const timelineItemId = createToolTimelineItemId({
					workflowRunId: params.context.workflowRunId,
					toolCallId,
				});

				const sanitizedInput = telemetry.sanitizeInput
					? telemetry.sanitizeInput(input)
					: sanitizeToolInputDefault(input);
				const deepTraceEnabled = params.context.deepTraceEnabled === true;
				const tracePayloadMode: ToolTracePayloadMode =
					params.context.tracePayloadMode ?? "sanitized";
				const baseLogMessage = `[ai-pipeline:tool] conv=${params.context.conversationId} workflowRunId=${params.context.workflowRunId} tool=${toolName} toolCallId=${toolCallId}`;

				incrementCount(params.context.runtimeState.toolCallCounts, toolName);

				if (deepTraceEnabled) {
					emitStructuredToolLog(
						params.context,
						"log",
						`${baseLogMessage} evt=start payloadMode=${tracePayloadMode}`,
						{
							input: buildTracePayloadByMode({
								mode: tracePayloadMode,
								rawPayload: input,
								sanitizedPayload: sanitizedInput,
							}),
						}
					);
				} else {
					emitStructuredToolLog(
						params.context,
						"log",
						`${baseLogMessage} evt=start`
					);
				}

				await safeCreatePartialToolTimelineItem({
					context: params.context,
					toolName,
					telemetry,
					toolCallId,
					timelineItemId,
					sanitizedInput,
				});

				await safeEmitToolProgress({
					context: params.context,
					toolName,
					toolCallId,
					telemetry,
					state: "partial",
					sanitizedInput,
				});

				try {
					const result = await originalExecute(
						input as never,
						options as never
					);
					const durationMs = Date.now() - startedAt;
					const failureText = getFailureTextFromResult(result);
					const state = failureText ? "error" : "result";
					const sanitizedOutput = telemetry.sanitizeOutput
						? telemetry.sanitizeOutput(result)
						: sanitizeToolDebugValue(result);

					if (state === "error") {
						incrementCount(
							params.context.runtimeState.failedToolCallCounts,
							toolName
						);
					} else {
						incrementCount(
							params.context.runtimeState.successfulToolCallCounts,
							toolName
						);
						if (!shouldTreatAsFailure(result)) {
							incrementCount(
								params.context.runtimeState.chargeableToolCallCounts,
								toolName
							);
						}
					}

					await safeUpdateToolTimelineItem({
						context: params.context,
						toolName,
						telemetry,
						toolCallId,
						timelineItemId,
						state,
						sanitizedInput,
						sanitizedOutput,
						errorText: failureText ?? undefined,
					});

					await safeEmitToolProgress({
						context: params.context,
						toolName,
						toolCallId,
						telemetry,
						state,
						sanitizedInput,
						sanitizedOutput,
						errorText: failureText ?? undefined,
					});

					if (deepTraceEnabled) {
						emitStructuredToolLog(
							params.context,
							state === "error" ? "warn" : "log",
							`${baseLogMessage} evt=end state=${state} durationMs=${durationMs} payloadMode=${tracePayloadMode}`,
							{
								output: buildTracePayloadByMode({
									mode: tracePayloadMode,
									rawPayload: result,
									sanitizedPayload: sanitizedOutput,
								}),
								...(failureText ? { error: failureText } : {}),
							}
						);
					} else {
						emitStructuredToolLog(
							params.context,
							state === "error" ? "warn" : "log",
							`${baseLogMessage} evt=end state=${state} durationMs=${durationMs}`
						);
					}

					return result;
				} catch (error) {
					const durationMs = Date.now() - startedAt;
					const errorText = toErrorText(error);
					incrementCount(
						params.context.runtimeState.failedToolCallCounts,
						toolName
					);

					await safeUpdateToolTimelineItem({
						context: params.context,
						toolName,
						telemetry,
						toolCallId,
						timelineItemId,
						state: "error",
						sanitizedInput,
						errorText,
					});

					await safeEmitToolProgress({
						context: params.context,
						toolName,
						toolCallId,
						telemetry,
						state: "error",
						sanitizedInput,
						errorText,
					});

					if (deepTraceEnabled) {
						emitStructuredToolLog(
							params.context,
							"error",
							`${baseLogMessage} evt=end state=threw durationMs=${durationMs} payloadMode=${tracePayloadMode}`,
							{
								error: errorText,
								output: buildTracePayloadByMode({
									mode: tracePayloadMode,
									rawPayload: error,
								}),
							}
						);
					} else {
						emitStructuredToolLog(
							params.context,
							"error",
							`${baseLogMessage} evt=end state=threw durationMs=${durationMs}`,
							error
						);
					}
					throw error;
				}
			},
		};
	}

	return wrappedTools;
}
