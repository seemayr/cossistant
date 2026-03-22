import { ActivityWrapper } from "../activity-wrapper";
import type { ToolActivityProps } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTitle(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	if (typeof data?.title === "string") {
		return data.title;
	}

	if (typeof output.title === "string") {
		return output.title;
	}

	return null;
}

function extractChanged(output: unknown): boolean | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	if (typeof data?.changed === "boolean") {
		return data.changed;
	}

	if (typeof output.changed === "boolean") {
		return output.changed;
	}

	return null;
}

export function UpdateConversationTitleActivity({
	toolCall,
	timestamp,
	showIcon = true,
	showStateIndicator = false,
	showTerminalIndicator = true,
	icon,
}: ToolActivityProps) {
	const { state, output, summaryText } = toolCall;

	if (state === "partial") {
		return (
			<ActivityWrapper
				icon={icon}
				showIcon={showIcon}
				showStateIndicator={showStateIndicator}
				showTerminalIndicator={showTerminalIndicator}
				state="partial"
				text="Updating title..."
				timestamp={timestamp}
			/>
		);
	}

	if (state === "error") {
		return (
			<ActivityWrapper
				icon={icon}
				showIcon={showIcon}
				showStateIndicator={showStateIndicator}
				showTerminalIndicator={showTerminalIndicator}
				state="error"
				text="Failed to update title"
				timestamp={timestamp}
			/>
		);
	}

	if (extractChanged(output) === false) {
		return (
			<ActivityWrapper
				icon={icon}
				showIcon={showIcon}
				showStateIndicator={showStateIndicator}
				showTerminalIndicator={showTerminalIndicator}
				state="result"
				text={summaryText}
				timestamp={timestamp}
			/>
		);
	}

	const title = extractTitle(output);
	const resultText = title ? (
		<>
			Changed title to{" "}
			<span className="font-semibold">&ldquo;{title}&rdquo;</span>
		</>
	) : (
		summaryText
	);

	return (
		<ActivityWrapper
			icon={icon}
			showIcon={showIcon}
			showStateIndicator={showStateIndicator}
			showTerminalIndicator={showTerminalIndicator}
			state="result"
			text={resultText}
			timestamp={timestamp}
		/>
	);
}
