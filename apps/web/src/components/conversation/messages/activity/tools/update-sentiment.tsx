import { cn } from "@/lib/utils";
import { ActivityWrapper } from "../activity-wrapper";
import type { ToolActivityProps } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractSentiment(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	if (typeof data?.sentiment === "string") {
		return data.sentiment;
	}

	if (typeof output.sentiment === "string") {
		return output.sentiment;
	}

	return null;
}

const sentimentDotColor: Record<string, string> = {
	positive: "bg-emerald-500",
	neutral: "bg-zinc-400",
	negative: "bg-red-500",
	frustrated: "bg-orange-500",
};

export function UpdateSentimentActivity({
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
				text="Analyzing sentiment..."
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
				text="Failed to update sentiment"
				timestamp={timestamp}
			/>
		);
	}

	const sentiment = extractSentiment(output);
	const dotClass = sentiment
		? (sentimentDotColor[sentiment.toLowerCase()] ?? "bg-zinc-400")
		: null;

	const resultText = sentiment ? (
		<>
			Sentiment:{" "}
			{dotClass ? (
				<span className={cn("inline-block size-2 rounded-full", dotClass)} />
			) : null}{" "}
			{sentiment}
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
