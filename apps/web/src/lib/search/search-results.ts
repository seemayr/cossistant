import {
	inferFallbackKind,
	inferSourceFromUrl,
	SEARCH_KIND_LABELS,
	SEARCH_SOURCE_LABELS,
	type SearchCatalogMap,
	type SearchKind,
	type SearchSource,
	stripHash,
} from "@/lib/search/search-metadata";

const MARK_TAG_PATTERN = /<\/?mark\b[^>]*>/gi;
const MARK_SEGMENT_PATTERN = /<mark\b[^>]*>(.*?)<\/mark>/gi;

export type HighlightedSegment = {
	text: string;
	highlighted: boolean;
};

export type TopbarQuickLinkDefinition = {
	label: string;
	url: string;
};

export type TopbarQuickLink = TopbarQuickLinkDefinition & {
	source: SearchSource;
	kind: SearchKind;
	sourceLabel: string;
	kindLabel: string;
	pageTitle?: string;
	description?: string;
	tags: string[];
	aliases: string[];
};

export const TOPBAR_QUICK_LINKS: TopbarQuickLinkDefinition[] = [
	{
		label: "Docs",
		url: "/docs",
	},
	{
		label: "Quick start next",
		url: "/docs/quickstart",
	},
	{
		label: "<Support /> component",
		url: "/docs/support-component",
	},
	{
		label: "Visitors",
		url: "/docs/concepts",
	},
	{
		label: "Contacts",
		url: "/docs/concepts/contacts",
	},
	{
		label: "Conversations",
		url: "/docs/concepts/conversations",
	},
	{
		label: "Timeline items",
		url: "/docs/concepts/timeline-items",
	},
];

export function stripMarkTags(content: string): string {
	return content.replace(MARK_TAG_PATTERN, "");
}

function appendSegment(
	segments: HighlightedSegment[],
	text: string,
	highlighted: boolean
): void {
	const normalized = stripMarkTags(text);
	if (!normalized) {
		return;
	}

	const previous = segments.at(-1);
	if (previous && previous.highlighted === highlighted) {
		previous.text += normalized;
		return;
	}

	segments.push({
		text: normalized,
		highlighted,
	});
}

export function splitMarkedContent(content: string): HighlightedSegment[] {
	const segments: HighlightedSegment[] = [];
	let cursor = 0;

	for (const match of content.matchAll(MARK_SEGMENT_PATTERN)) {
		const start = match.index ?? 0;
		if (start > cursor) {
			appendSegment(segments, content.slice(cursor, start), false);
		}

		appendSegment(segments, match[1] ?? "", true);
		cursor = start + match[0].length;
	}

	if (segments.length === 0) {
		const plainText = stripMarkTags(content);
		return plainText
			? [
					{
						text: plainText,
						highlighted: false,
					},
				]
			: [];
	}

	if (cursor < content.length) {
		appendSegment(segments, content.slice(cursor), false);
	}

	return segments;
}

export function buildTopbarQuickLinks(
	catalog: SearchCatalogMap
): TopbarQuickLink[] {
	return TOPBAR_QUICK_LINKS.map((link) => {
		const baseUrl = stripHash(link.url);
		const entry = catalog[baseUrl];
		const source = entry?.source ?? inferSourceFromUrl(link.url);
		const kind =
			entry?.kind ??
			inferFallbackKind({
				source,
				url: link.url,
				title: entry?.title ?? link.label,
			});

		return {
			...link,
			source,
			kind,
			sourceLabel: SEARCH_SOURCE_LABELS[source],
			kindLabel: SEARCH_KIND_LABELS[kind],
			pageTitle: entry?.title,
			description: entry?.description,
			tags: entry?.tags ?? [],
			aliases: entry?.aliases ?? [],
		};
	});
}
