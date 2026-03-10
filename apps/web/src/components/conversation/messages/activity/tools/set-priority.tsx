import { Badge } from "@/components/ui/badge";
import { ActivityWrapper } from "../activity-wrapper";
import type { ToolActivityProps } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractPriority(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	if (typeof data?.priority === "string") {
		return data.priority;
	}

	if (typeof output.priority === "string") {
		return output.priority;
	}

	return null;
}

const priorityVariant: Record<string, "default" | "secondary" | "destructive"> =
	{
		low: "secondary",
		medium: "default",
		high: "destructive",
		urgent: "destructive",
	};

export function SetPriorityActivity({
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
				text="Setting priority..."
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
				text="Failed to set priority"
				timestamp={timestamp}
			/>
		);
	}

	const priority = extractPriority(output);
	const variant = priority
		? (priorityVariant[priority.toLowerCase()] ?? "secondary")
		: "secondary";

	const resultText = priority ? (
		<>Conversation priority set to "{priority}"</>
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
