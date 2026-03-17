"use client";

import type React from "react";
import { extractToolPart } from "../../utils/timeline-tool";
import type { ConversationTimelineToolProps } from "./timeline-tool-types";
import { WidgetToolActivityRow } from "./timeline-widget-tool";
import { useToolDisplayState } from "./use-tool-display-state";

type WidgetSource = {
	key: string;
	label: string;
	href: string;
};

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

function normalizeSourceTitle(title: string | null | undefined): string | null {
	const trimmedTitle = title?.trim();
	if (!trimmedTitle) {
		return null;
	}

	return trimmedTitle.replace(/\s+/g, " ").toLowerCase();
}

function normalizeSourceUrl(
	sourceUrl: string | null | undefined
): string | null {
	const trimmedSourceUrl = sourceUrl?.trim();
	if (!trimmedSourceUrl) {
		return null;
	}

	try {
		const parsed = new URL(trimmedSourceUrl);
		const normalizedHostname = parsed.hostname.toLowerCase();
		const normalizedPathname =
			parsed.pathname === "/"
				? "/"
				: parsed.pathname.replace(/\/+$/, "") || "/";
		const normalizedPort = parsed.port ? `:${parsed.port}` : "";

		return `${parsed.protocol}//${normalizedHostname}${normalizedPort}${normalizedPathname}${parsed.search}`;
	} catch {
		return null;
	}
}

function toCompactSourceLabel(params: {
	title?: string | null;
	sourceUrl?: string | null;
}): string | null {
	const trimmedTitle = params.title?.trim();
	if (trimmedTitle) {
		return trimmedTitle;
	}

	const trimmedSourceUrl = params.sourceUrl?.trim();
	if (trimmedSourceUrl) {
		try {
			const parsed = new URL(trimmedSourceUrl);
			const hostname = parsed.hostname.replace(/^www\./, "");
			const pathname =
				parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
			return `${hostname}${pathname}`;
		} catch {
			return trimmedSourceUrl;
		}
	}

	return null;
}

function extractWidgetSources(output: unknown): WidgetSource[] {
	if (!isRecord(output)) {
		return [];
	}

	const data = isRecord(output.data) ? output.data : null;
	const articles = Array.isArray(data?.articles) ? data.articles : [];
	const seenKeys = new Set<string>();
	const widgetSources: WidgetSource[] = [];

	for (const article of articles) {
		if (!isRecord(article)) {
			continue;
		}

		if (article.sourceType !== "url") {
			continue;
		}

		const sourceUrl =
			typeof article.sourceUrl === "string" ? article.sourceUrl.trim() : "";
		const normalizedSourceUrl = normalizeSourceUrl(sourceUrl);
		if (!normalizedSourceUrl) {
			continue;
		}

		const dedupeKey = `url:${normalizedSourceUrl}`;
		if (seenKeys.has(dedupeKey)) {
			continue;
		}

		seenKeys.add(dedupeKey);
		const title = typeof article.title === "string" ? article.title : null;
		const label =
			toCompactSourceLabel({
				title,
				sourceUrl,
			}) ??
			normalizeSourceTitle(title) ??
			sourceUrl;

		widgetSources.push({
			key: dedupeKey,
			label,
			href: sourceUrl,
		});

		if (widgetSources.length === 3) {
			break;
		}
	}

	return widgetSources;
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
