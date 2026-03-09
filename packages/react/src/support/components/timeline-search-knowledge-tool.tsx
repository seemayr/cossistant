"use client";

import type React from "react";
import { extractToolPart } from "../../utils/timeline-tool";
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

function toCompactSourceLabel(article: unknown): string | null {
	if (!isRecord(article)) {
		return null;
	}

	if (typeof article.title === "string" && article.title.trim().length > 0) {
		return article.title.trim();
	}

	if (
		typeof article.sourceUrl === "string" &&
		article.sourceUrl.trim().length > 0
	) {
		try {
			const parsed = new URL(article.sourceUrl);
			const hostname = parsed.hostname.replace(/^www\./, "");
			const pathname =
				parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
			return `${hostname}${pathname}`;
		} catch {
			return article.sourceUrl.trim();
		}
	}

	return null;
}

function extractSourceLabels(output: unknown): string[] {
	if (!isRecord(output)) {
		return [];
	}

	const data = isRecord(output.data) ? output.data : null;
	const articles = Array.isArray(data?.articles) ? data.articles : [];
	return articles
		.map((article) => toCompactSourceLabel(article))
		.filter((label): label is string => Boolean(label))
		.slice(0, 3);
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

	const sourceLabels =
		displayState === "result" ? extractSourceLabels(toolPart?.output) : [];

	return (
		<WidgetToolActivityRow
			detailLabels={sourceLabels}
			state={displayState}
			text={text}
		/>
	);
}
