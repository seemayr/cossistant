import type { PipelineToolContext, ToolTracePayloadMode } from "../contracts";

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

export function emitStructuredToolLog(
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
