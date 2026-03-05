import type { ToolTelemetrySpec } from "../contracts";

type ToolTelemetryTextParams = {
	toolName: string;
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
};

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

export function buildToolSummaryText(params: {
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

export function buildToolProgressText(params: {
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
