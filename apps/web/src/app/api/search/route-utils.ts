import type { AdvancedIndex } from "fumadocs-core/search/server";
import {
	buildSearchAliases,
	buildSearchTags,
	normalizeSearchFrontmatter,
	resolveSearchKind,
	SEARCH_KIND_LABELS,
	SEARCH_SOURCE_LABELS,
	type SearchSource,
} from "@/lib/search/search-metadata";

export type SearchStructuredData = {
	headings: Array<{ id: string; content: string }>;
	contents: Array<{ heading?: string; content: string }>;
};

export type BuildAdvancedSearchIndexInput = {
	id: string;
	url: string;
	path: string;
	source: SearchSource;
	title: string;
	description?: string;
	breadcrumbs?: string[];
	structuredData: SearchStructuredData;
	search?: unknown;
	extraTags?: string[];
	extraAliases?: string[];
};

function dedupeText(values: string[]): string[] {
	const seen = new Set<string>();
	const deduped: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed) {
			continue;
		}

		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(trimmed);
	}

	return deduped;
}

export function buildSearchMetadataText({
	source,
	kind,
	title,
	tags,
	aliases,
}: {
	source: SearchSource;
	kind: keyof typeof SEARCH_KIND_LABELS;
	title: string;
	tags: string[];
	aliases: string[];
}): string {
	return dedupeText([
		title,
		SEARCH_SOURCE_LABELS[source],
		SEARCH_KIND_LABELS[kind],
		...tags,
		...aliases,
	]).join(" ");
}

export function buildAdvancedSearchIndex({
	id,
	url,
	path,
	source,
	title,
	description,
	breadcrumbs,
	structuredData,
	search,
	extraTags,
	extraAliases,
}: BuildAdvancedSearchIndexInput): AdvancedIndex {
	const frontmatter = normalizeSearchFrontmatter(search);
	const kind = resolveSearchKind({
		source,
		url,
		path,
		title,
		frontmatter,
	});
	const tags = buildSearchTags({
		source,
		kind,
		frontmatter,
		extraTags,
	});
	const aliases = buildSearchAliases({
		frontmatter,
		extraAliases,
	});
	const metadataText = buildSearchMetadataText({
		source,
		kind,
		title,
		tags,
		aliases,
	});

	return {
		id,
		title,
		description,
		breadcrumbs,
		tag: tags,
		url,
		structuredData: {
			headings: structuredData.headings.map((heading) => ({
				id: heading.id,
				content: heading.content,
			})),
			contents: [
				...structuredData.contents.map((content) => ({
					heading: content.heading,
					content: content.content,
				})),
				{
					heading: undefined,
					content: metadataText,
				},
			],
		},
	};
}
