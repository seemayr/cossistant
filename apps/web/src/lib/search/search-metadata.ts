export const SEARCH_SOURCES = ["docs", "blog", "changelog", "other"] as const;

export type SearchSource = (typeof SEARCH_SOURCES)[number];

export const SEARCH_KINDS = [
	"guide",
	"component",
	"hook",
	"type",
	"concept",
	"article",
	"release",
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export type SearchFrontmatter = {
	kind?: SearchKind;
	tags?: string[];
	aliases?: string[];
};

export type SearchCatalogEntry = {
	url: string;
	source: SearchSource;
	kind: SearchKind;
	title: string;
	description?: string;
	tags: string[];
	aliases: string[];
};

export type SearchCatalogMap = Record<string, SearchCatalogEntry>;

export const SEARCH_SOURCE_LABELS: Record<SearchSource, string> = {
	docs: "Docs",
	blog: "Blog",
	changelog: "Changelog",
	other: "Other",
};

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
	guide: "Guide",
	component: "Component",
	hook: "Hook",
	type: "Type",
	concept: "Concept",
	article: "Article",
	release: "Release",
};

const SEARCH_SOURCE_SET = new Set<SearchSource>(SEARCH_SOURCES);
const SEARCH_KIND_SET = new Set<SearchKind>(SEARCH_KINDS);

type ResolveSearchKindInput = {
	source: SearchSource;
	url: string;
	path?: string;
	title?: string;
	frontmatter?: SearchFrontmatter;
};

type BuildSearchTagsInput = {
	source: SearchSource;
	kind: SearchKind;
	frontmatter?: SearchFrontmatter;
	extraTags?: string[];
};

type BuildSearchAliasesInput = {
	frontmatter?: SearchFrontmatter;
	extraAliases?: string[];
};

type InferSearchKindInput = {
	source: SearchSource;
	url: string;
	path?: string;
	title?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function sanitizeStringList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const normalized: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") {
			continue;
		}

		const trimmed = item.trim();
		if (!trimmed) {
			continue;
		}

		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		normalized.push(trimmed);
	}

	return normalized;
}

function toSearchTag(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^\w\s/-]+/g, "")
		.replace(/\s+/g, "-");
}

function isSearchKind(value: unknown): value is SearchKind {
	return typeof value === "string" && SEARCH_KIND_SET.has(value as SearchKind);
}

function toTitleCase(value: string): string {
	return value
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export function stripHash(url: string): string {
	const hashIndex = url.indexOf("#");
	if (hashIndex === -1) {
		return url;
	}

	return url.slice(0, hashIndex);
}

export function inferSourceFromUrl(url: string): SearchSource {
	if (url.startsWith("/docs")) {
		return "docs";
	}

	if (url.startsWith("/blog")) {
		return "blog";
	}

	if (url.startsWith("/changelog")) {
		return "changelog";
	}

	return "other";
}

export function inferTitleFromPath(path: string, url: string): string {
	const cleanedPath = path.replace(/\\/g, "/");
	const segments = cleanedPath.split("/").filter(Boolean);
	let leaf = segments.at(-1) ?? "";
	leaf = leaf.replace(/\.mdx?$/i, "");

	if (leaf === "index") {
		const parent = segments.at(-2);

		if (parent && parent !== "(root)") {
			return toTitleCase(parent.replace(/[-_]+/g, " "));
		}

		if (url.startsWith("/docs")) {
			return "Docs";
		}
		if (url.startsWith("/blog")) {
			return "Blog";
		}
		if (url.startsWith("/changelog")) {
			return "Changelog";
		}
	}

	return toTitleCase(leaf.replace(/[-_]+/g, " ")) || "Untitled";
}

export function normalizeSearchFrontmatter(value: unknown): SearchFrontmatter {
	if (!isRecord(value)) {
		return {};
	}

	const kind = isSearchKind(value.kind) ? value.kind : undefined;
	const tags = sanitizeStringList(value.tags);
	const aliases = sanitizeStringList(value.aliases);

	return {
		kind,
		tags: tags.length > 0 ? tags : undefined,
		aliases: aliases.length > 0 ? aliases : undefined,
	};
}

export function getSearchFrontmatterFromData(data: unknown): SearchFrontmatter {
	if (!isRecord(data)) {
		return {};
	}

	return normalizeSearchFrontmatter(data.search);
}

export function inferFallbackKind({
	source,
	url,
	path,
	title,
}: InferSearchKindInput): SearchKind {
	if (source === "blog") {
		return "article";
	}

	if (source === "changelog") {
		return "release";
	}

	if (source !== "docs") {
		return "guide";
	}

	const searchSpace =
		`${stripHash(url)} ${path ?? ""} ${title ?? ""}`.toLowerCase();

	if (searchSpace.includes("/concept")) {
		return "concept";
	}

	if (
		searchSpace.includes("/hook") ||
		searchSpace.includes(" hook ") ||
		searchSpace.includes("usesupport")
	) {
		return "hook";
	}

	if (
		searchSpace.includes("/component") ||
		searchSpace.includes("/primitive") ||
		searchSpace.includes("<support")
	) {
		return "component";
	}

	if (
		searchSpace.includes("/types") ||
		searchSpace.includes(" type ") ||
		searchSpace.includes(" types ")
	) {
		return "type";
	}

	return "guide";
}

export function resolveSearchKind({
	source,
	url,
	path,
	title,
	frontmatter,
}: ResolveSearchKindInput): SearchKind {
	if (frontmatter?.kind && SEARCH_KIND_SET.has(frontmatter.kind)) {
		return frontmatter.kind;
	}

	return inferFallbackKind({
		source,
		url,
		path,
		title,
	});
}

export function buildSearchTags({
	source,
	kind,
	frontmatter,
	extraTags = [],
}: BuildSearchTagsInput): string[] {
	const tags = new Set<string>();

	tags.add(source);
	tags.add(kind);

	const mergedTags = [...(frontmatter?.tags ?? []), ...extraTags]
		.map(toSearchTag)
		.filter(Boolean);

	for (const tag of mergedTags) {
		tags.add(tag);
	}

	return Array.from(tags);
}

export function buildSearchAliases({
	frontmatter,
	extraAliases = [],
}: BuildSearchAliasesInput): string[] {
	const aliases = [...(frontmatter?.aliases ?? []), ...extraAliases];
	return sanitizeStringList(aliases);
}

export function isSearchSource(value: unknown): value is SearchSource {
	return (
		typeof value === "string" && SEARCH_SOURCE_SET.has(value as SearchSource)
	);
}
