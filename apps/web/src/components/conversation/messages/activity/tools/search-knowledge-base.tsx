import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ActivityWrapper } from "../activity-wrapper";
import type { ToolActivityProps } from "../types";

type ArticleSummary = {
	title?: string | null;
	sourceUrl?: string | null;
	sourceType?: string | null;
	similarity?: number | null;
};

const INLINE_SOURCE_LIMIT = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractArticles(output: unknown): ArticleSummary[] {
	if (!isRecord(output)) {
		return [];
	}

	const data = isRecord(output.data) ? output.data : null;
	const articles = Array.isArray(data?.articles) ? data.articles : [];

	return articles
		.filter((a): a is Record<string, unknown> => isRecord(a))
		.map((a) => ({
			title: typeof a.title === "string" ? a.title : null,
			sourceUrl: typeof a.sourceUrl === "string" ? a.sourceUrl : null,
			sourceType: typeof a.sourceType === "string" ? a.sourceType : null,
			similarity: typeof a.similarity === "number" ? a.similarity : null,
		}));
}

function extractSearchQuery(input: unknown): string | null {
	if (!isRecord(input) || typeof input.query !== "string") {
		return null;
	}

	const query = input.query.trim();
	return query.length > 0 ? query : null;
}

function getSourceLabel(article: ArticleSummary): string {
	const title = article.title?.trim();
	if (title && title.length > 0) {
		return title;
	}

	const sourceUrl = article.sourceUrl?.trim();
	if (sourceUrl && sourceUrl.length > 0) {
		try {
			const parsedUrl = new URL(sourceUrl);
			const hostname = parsedUrl.hostname.replace(/^www\./, "");
			const pathname =
				parsedUrl.pathname === "/" ? "" : parsedUrl.pathname.replace(/\/$/, "");

			const compactUrl = `${hostname}${pathname}`;
			return compactUrl.length > 0 ? compactUrl : sourceUrl;
		} catch {
			return sourceUrl;
		}
	}

	return "Untitled";
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

function SourcePillList({ articles }: { articles: ArticleSummary[] }) {
	const visibleArticles = articles.slice(0, INLINE_SOURCE_LIMIT);
	const hiddenArticles = articles.slice(INLINE_SOURCE_LIMIT);
	const hiddenSourceEntries = hiddenArticles.map((article, index) => ({
		key: article.sourceUrl ?? article.title ?? `overflow-source-${index}`,
		label: getSourceLabel(article),
	}));

	if (articles.length === 0) {
		return null;
	}

	return (
		<div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
			{visibleArticles.map((article, index) => {
				const label = getSourceLabel(article);

				return (
					<Badge
						className="max-w-[10rem] px-1.5 py-0 font-normal text-[10px] text-muted-foreground"
						data-source-pill="true"
						key={article.sourceUrl ?? article.title ?? `source-${index}`}
						title={label}
						variant="secondary"
					>
						<span className="truncate">{label}</span>
					</Badge>
				);
			})}

			{hiddenArticles.length > 0 ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Badge
							className="cursor-default px-1.5 py-0 font-normal text-[10px] text-muted-foreground"
							data-source-overflow={hiddenSourceEntries.length}
							variant="outline"
						>
							+{hiddenSourceEntries.length}
						</Badge>
					</TooltipTrigger>
					<TooltipContent
						align="start"
						className="max-w-72 space-y-1 px-2 py-1.5"
						forceMount
						side="bottom"
					>
						{hiddenSourceEntries.map((entry) => (
							<div
								className="truncate text-[10px] text-primary-foreground/90"
								key={entry.key}
								title={entry.label}
							>
								{entry.label}
							</div>
						))}
					</TooltipContent>
				</Tooltip>
			) : null}
			{hiddenSourceEntries.length > 0 ? (
				<div className="hidden" data-source-overflow-content="true">
					{hiddenSourceEntries.map((entry) => (
						<span
							data-source-overflow-item="true"
							key={`source-hook-${entry.key}`}
						>
							{entry.label}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

export function SearchKnowledgeBaseActivity({
	toolCall,
	timestamp,
	showIcon = true,
	showStateIndicator = false,
	showTerminalIndicator = true,
	icon,
}: ToolActivityProps) {
	const { input, state, output, summaryText } = toolCall;
	const query = extractSearchQuery(input);
	const text = getKnowledgeSearchText({
		query,
		state,
		resultFallbackText: summaryText,
	});

	if (state === "partial") {
		return (
			<ActivityWrapper
				icon={icon}
				showIcon={showIcon}
				showStateIndicator={showStateIndicator}
				showTerminalIndicator={showTerminalIndicator}
				state="partial"
				text={text}
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
				text={text}
				timestamp={timestamp}
			/>
		);
	}

	const articles = extractArticles(output);

	return (
		<ActivityWrapper
			icon={icon}
			showIcon={showIcon}
			showStateIndicator={showStateIndicator}
			showTerminalIndicator={showTerminalIndicator}
			state="result"
			text={text}
			timestamp={timestamp}
		>
			<SourcePillList articles={articles} />
		</ActivityWrapper>
	);
}
