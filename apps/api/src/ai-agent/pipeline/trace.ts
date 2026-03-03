import type {
	ToolTraceDiagnostics,
	ToolTracePayloadMode,
} from "../tools/types";

type JsonLike =
	| null
	| boolean
	| number
	| string
	| JsonLike[]
	| { [key: string]: JsonLike };

function safeJsonSize(value: unknown): number | null {
	try {
		return JSON.stringify(value).length;
	} catch {
		return null;
	}
}

export function isDeepTraceEnabled(value: unknown): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		return value.toLowerCase() === "true";
	}
	return false;
}

function toMetadataPayload(value: unknown): JsonLike {
	if (value === null) {
		return { kind: "null", jsonSize: safeJsonSize(value) };
	}

	if (Array.isArray(value)) {
		return {
			kind: "array",
			length: value.length,
			jsonSize: safeJsonSize(value),
		};
	}

	switch (typeof value) {
		case "string":
			return {
				kind: "string",
				length: value.length,
				jsonSize: safeJsonSize(value),
			};
		case "number":
		case "boolean":
			return {
				kind: typeof value,
				jsonSize: safeJsonSize(value),
			};
		case "undefined":
			return {
				kind: "undefined",
				jsonSize: null,
			};
		case "function":
			return {
				kind: "function",
				jsonSize: null,
			};
		case "bigint":
			return {
				kind: "bigint",
				value: value.toString(),
				jsonSize: null,
			};
		case "object": {
			const keys = Object.keys(value as Record<string, unknown>);
			return {
				kind: "object",
				keys: keys.length,
				sampleKeys: keys.slice(0, 12),
				jsonSize: safeJsonSize(value),
			};
		}
		default:
			return {
				kind: "unknown",
				jsonSize: safeJsonSize(value),
			};
	}
}

export function getToolTracePayloadMode(
	value: string | undefined
): ToolTracePayloadMode {
	switch (value) {
		case "raw":
		case "sanitized":
		case "metadata":
			return value;
		default:
			return "sanitized";
	}
}

export function createToolTraceDiagnostics(
	initialPhase = "pipeline_init"
): ToolTraceDiagnostics {
	const now = Date.now();
	return {
		phase: initialPhase,
		toolCallsStarted: 0,
		toolCallsFinished: 0,
		lastToolName: null,
		lastActivityAtMs: now,
		abortReason: null,
	};
}

export function setToolTracePhase(
	diagnostics: ToolTraceDiagnostics | undefined,
	phase: string
): void {
	if (!diagnostics) {
		return;
	}
	diagnostics.phase = phase;
	diagnostics.lastActivityAtMs = Date.now();
}

export function setToolTraceAbortReason(
	diagnostics: ToolTraceDiagnostics | undefined,
	abortReason: string
): void {
	if (!diagnostics) {
		return;
	}
	diagnostics.abortReason = abortReason;
	diagnostics.lastActivityAtMs = Date.now();
}

export function markToolTraceCallStarted(
	diagnostics: ToolTraceDiagnostics | undefined,
	toolName: string
): void {
	if (!diagnostics) {
		return;
	}
	diagnostics.toolCallsStarted += 1;
	diagnostics.lastToolName = toolName;
	diagnostics.phase = `tool:${toolName}:running`;
	diagnostics.lastActivityAtMs = Date.now();
}

export function markToolTraceCallFinished(
	diagnostics: ToolTraceDiagnostics | undefined,
	toolName: string
): void {
	if (!diagnostics) {
		return;
	}
	diagnostics.toolCallsFinished += 1;
	diagnostics.lastToolName = toolName;
	diagnostics.phase = `tool:${toolName}:completed`;
	diagnostics.lastActivityAtMs = Date.now();
}

export function formatToolTraceDiagnostics(
	diagnostics: ToolTraceDiagnostics,
	nowMs = Date.now()
): string {
	const sinceLastActivityMs = Math.max(0, nowMs - diagnostics.lastActivityAtMs);
	return [
		`phase=${diagnostics.phase}`,
		`toolCallsStarted=${diagnostics.toolCallsStarted}`,
		`toolCallsFinished=${diagnostics.toolCallsFinished}`,
		`lastToolName=${diagnostics.lastToolName ?? "none"}`,
		`sinceLastActivityMs=${sinceLastActivityMs}`,
		`abortReason=${diagnostics.abortReason ?? "none"}`,
	].join(" | ");
}

export function buildTracePayloadByMode(params: {
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
