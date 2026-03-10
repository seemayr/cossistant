import { ActivityWrapper } from "../activity-wrapper";
import type { ToolActivityProps } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractViewName(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	if (typeof data?.viewName === "string") {
		return data.viewName;
	}

	if (typeof output.viewName === "string") {
		return output.viewName;
	}

	return null;
}

export function CategorizeConversationActivity({
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
				text="Classifying conversation..."
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
				text="Failed to classify conversation"
				timestamp={timestamp}
			/>
		);
	}

	const viewName = extractViewName(output);
	const resultText = viewName ? (
		<>
			Classified as{" "}
			<span className="font-semibold">&ldquo;{viewName}&rdquo;</span>
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
