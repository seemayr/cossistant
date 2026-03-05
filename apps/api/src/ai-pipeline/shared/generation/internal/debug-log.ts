import type { GenerationRuntimeInput } from "../contracts";

export function emitGenerationDebugLog(
	input: GenerationRuntimeInput,
	level: "log" | "warn" | "error",
	message: string,
	payload?: unknown
): void {
	const logger = input.debugLogger;
	const args = payload === undefined ? [message] : [message, payload];

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
