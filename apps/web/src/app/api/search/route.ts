import { findPath } from "fumadocs-core/page-tree";
import {
	type AdvancedIndex,
	createSearchAPI,
} from "fumadocs-core/search/server";
import { inferTitleFromPath } from "@/lib/search/search-metadata";
import { blog, changelog, source } from "@/lib/source";
import {
	buildAdvancedSearchIndex,
	type SearchStructuredData,
} from "./route-utils";

type SearchablePage = {
	path: string;
	url: string;
	data: unknown;
};

function getPageData(page: SearchablePage): Record<string, unknown> {
	if (typeof page.data === "object" && page.data !== null) {
		return page.data as Record<string, unknown>;
	}

	return {};
}

function getString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function getStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === "string");
}

function isPublished(page: SearchablePage): boolean {
	const data = getPageData(page);
	return data.published !== false;
}

function getStructuredData(page: SearchablePage): SearchStructuredData | null {
	const data = getPageData(page).structuredData;
	if (!data || typeof data !== "object") {
		return null;
	}

	const typed = data as SearchStructuredData;
	if (!(Array.isArray(typed.headings) && Array.isArray(typed.contents))) {
		return null;
	}

	return typed;
}

function getDocsBreadcrumbs(url: string): string[] {
	const path = findPath(
		source.pageTree.children,
		(node) => node.type === "page" && node.url === url
	);

	if (!path) {
		return ["Docs"];
	}

	const breadcrumbs = ["Docs"];

	for (const segment of path) {
		if (segment.type !== "folder") {
			continue;
		}

		if (typeof segment.name !== "string") {
			continue;
		}

		breadcrumbs.push(segment.name);
	}

	return breadcrumbs;
}

function buildDocsIndexes(): AdvancedIndex[] {
	return source.getPages().flatMap((page) => {
		const searchablePage = page as unknown as SearchablePage;
		const pageData = getPageData(searchablePage);
		const structuredData = getStructuredData(searchablePage);

		if (!structuredData) {
			return [];
		}

		const title =
			getString(pageData.title) ??
			inferTitleFromPath(searchablePage.path, searchablePage.url);
		const description = getString(pageData.description);

		return [
			buildAdvancedSearchIndex({
				id: `docs:${searchablePage.url}`,
				source: "docs",
				path: searchablePage.path,
				url: searchablePage.url,
				title,
				description,
				breadcrumbs: getDocsBreadcrumbs(searchablePage.url),
				structuredData,
				search: pageData.search,
			}),
		];
	});
}

function buildBlogIndexes(): AdvancedIndex[] {
	return blog.getPages().flatMap((page) => {
		const searchablePage = page as unknown as SearchablePage;
		const pageData = getPageData(searchablePage);
		if (!isPublished(searchablePage)) {
			return [];
		}

		const structuredData = getStructuredData(searchablePage);
		if (!structuredData) {
			return [];
		}

		const title =
			getString(pageData.title) ??
			inferTitleFromPath(searchablePage.path, searchablePage.url);
		const description = getString(pageData.description);
		const tags = getStringArray(pageData.tags);

		return [
			buildAdvancedSearchIndex({
				id: `blog:${searchablePage.url}`,
				source: "blog",
				path: searchablePage.path,
				url: searchablePage.url,
				title,
				description,
				breadcrumbs: ["Blog"],
				structuredData,
				search: pageData.search,
				extraTags: tags,
				extraAliases: tags,
			}),
		];
	});
}

function buildChangelogIndexes(): AdvancedIndex[] {
	return changelog.getPages().flatMap((page) => {
		const searchablePage = page as unknown as SearchablePage;
		const pageData = getPageData(searchablePage);
		const structuredData = getStructuredData(searchablePage);
		if (!structuredData) {
			return [];
		}

		const version = getString(pageData.version);
		const title =
			version ??
			getString(pageData.title) ??
			inferTitleFromPath(searchablePage.path, searchablePage.url);
		const description =
			getString(pageData["tiny-excerpt"]) ?? getString(pageData.description);
		const extraTags = [version, getString(pageData.date)].filter(
			(value): value is string => typeof value === "string" && value.length > 0
		);

		return [
			buildAdvancedSearchIndex({
				id: `changelog:${searchablePage.url}`,
				source: "changelog",
				path: searchablePage.path,
				url: searchablePage.url,
				title,
				description,
				breadcrumbs: ["Changelog"],
				structuredData,
				search: pageData.search,
				extraTags,
				extraAliases: version ? [version] : [],
			}),
		];
	});
}

export const searchApi = createSearchAPI("advanced", {
	indexes: () => [
		...buildDocsIndexes(),
		...buildBlogIndexes(),
		...buildChangelogIndexes(),
	],
});

export const { GET } = searchApi;
