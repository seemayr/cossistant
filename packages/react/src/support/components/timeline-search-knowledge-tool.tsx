"use client";

import type React from "react";
import { extractToolPart } from "../../utils/timeline-tool";
import { extractWidgetSources } from "./timeline-search-knowledge-sources";
import type { ConversationTimelineToolProps } from "./timeline-tool-types";
import { WidgetToolActivityRow } from "./timeline-widget-tool";
import { useToolDisplayState } from "./use-tool-display-state";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractSearchQuery(input: unknown): string | null {
	if (!isRecord(input) || typeof input.query !== "string") {
		return null;
	}

	const query = input.query.trim();
	return query.length > 0 ? query : null;
}

function getKnowledgeSearchText(params: {
	query: string | null;
	state: "partial" | "result" | "error";
	resultFallbackText: string;
}): string {
	const { query, state, resultFallbackText } = params;

	if (query) {
		if (state === "partial") {
			return `Searching for "${query}"...`;
		}

		if (state === "error") {
			return `Search for "${query}" failed`;
		}

		return `Searched for "${query}"`;
	}

	if (state === "partial") {
		return "Searching knowledge base...";
	}

	if (state === "error") {
		return "Knowledge base lookup failed";
	}

	return resultFallbackText;
}

export function SearchKnowledgeTimelineTool({
	item,
	showTerminalIndicator = true,
}: ConversationTimelineToolProps) {
	const toolPart = extractToolPart(item);
	const rawState = toolPart?.state ?? "partial";
	const displayState = useToolDisplayState({
		state: rawState,
		toolCallId: toolPart?.toolCallId ?? item.id ?? "searchKnowledgeBase",
	});
	const query = extractSearchQuery(toolPart?.input);
	const resultFallbackText =
		item.text?.trim() || "Finished knowledge base search";

	const text = getKnowledgeSearchText({
		query,
		state: displayState,
		resultFallbackText,
	});

	const widgetSources =
		displayState === "result" ? extractWidgetSources(toolPart?.output) : [];

	return (
		<WidgetToolActivityRow
			details={
				widgetSources.length > 0 ? (
					<div className="flex flex-col gap-1">
						{widgetSources.map((source) => (
							<a
								className="truncate underline underline-offset-2 hover:text-co-primary/90"
								href={source.href}
								key={source.key}
								rel="noopener noreferrer"
								target="_blank"
								title={source.label}
							>
								{source.label}
							</a>
						))}
					</div>
				) : undefined
			}
			showTerminalIndicator={showTerminalIndicator}
			state={displayState}
			text={text}
		/>
	);
}
