import Link from "next/link";

import { LogoText } from "@/components/ui/logo";
import { TopbarButton } from "@/components/ui/topbar-button";
import {
	buildSearchAliases,
	buildSearchTags,
	getSearchFrontmatterFromData,
	inferTitleFromPath,
	resolveSearchKind,
	type SearchCatalogMap,
	type SearchSource,
} from "@/lib/search/search-metadata";
import { blog, changelog, source } from "@/lib/source";
import { cn } from "@/lib/utils";
import { SearchBar } from "./search-bar";

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

function buildCatalogForSource(
	sourcePages: SearchablePage[],
	sourceType: SearchSource
): SearchCatalogMap {
	const catalog: SearchCatalogMap = {};

	for (const page of sourcePages) {
		const pageData = getPageData(page);
		const frontmatter = getSearchFrontmatterFromData(pageData);
		const explicitTitle = getString(pageData.title);
		const version = getString(pageData.version);
		const title =
			sourceType === "changelog"
				? (version ?? explicitTitle ?? inferTitleFromPath(page.path, page.url))
				: (explicitTitle ?? inferTitleFromPath(page.path, page.url));
		const description =
			sourceType === "changelog"
				? (getString(pageData["tiny-excerpt"]) ??
					getString(pageData.description))
				: getString(pageData.description);

		const extraTags =
			sourceType === "blog"
				? getStringArray(pageData.tags)
				: sourceType === "changelog"
					? [version, getString(pageData.date)].filter(
							(value): value is string =>
								typeof value === "string" && value.length > 0
						)
					: [];
		const extraAliases = sourceType === "changelog" && version ? [version] : [];
		const kind = resolveSearchKind({
			source: sourceType,
			url: page.url,
			path: page.path,
			title,
			frontmatter,
		});
		const tags = buildSearchTags({
			source: sourceType,
			kind,
			frontmatter,
			extraTags,
		});
		const aliases = buildSearchAliases({
			frontmatter,
			extraAliases,
		});

		catalog[page.url] = {
			url: page.url,
			source: sourceType,
			kind,
			title,
			description,
			tags,
			aliases,
		};
	}

	return catalog;
}

function buildSearchCatalog(): SearchCatalogMap {
	const docsPages = source.getPages() as unknown as SearchablePage[];
	const blogPages = (blog.getPages() as unknown as SearchablePage[]).filter(
		(page) => getPageData(page).published !== false
	);
	const changelogPages = changelog.getPages() as unknown as SearchablePage[];

	return {
		...buildCatalogForSource(docsPages, "docs"),
		...buildCatalogForSource(blogPages, "blog"),
		...buildCatalogForSource(changelogPages, "changelog"),
	};
}

export function TopBar({
	className,
	children,
}: {
	className?: string;
	children?: React.ReactNode;
}) {
	const searchCatalog = buildSearchCatalog();

	return (
		<div
			className={cn(
				"fixed top-0 right-0 left-0 z-50 border-grid-x border-dashed bg-background/90 backdrop-blur-xl",
				className
			)}
		>
			<div className="container-wrapper mx-auto">
				<div className="container mx-auto flex items-center justify-between py-4">
					<div className="flex w-60 items-center gap-6">
						<Link className="flex items-center" href="/">
							<LogoText />
						</Link>
					</div>
					<div className="hidden items-center space-x-4 md:flex">
						<TopbarButton className="text-foreground" href="/docs">
							Docs
						</TopbarButton>
						<TopbarButton href="/blog">Blog</TopbarButton>
						<TopbarButton className="text-foreground" href="/pricing">
							Pricing
						</TopbarButton>
						<TopbarButton className="text-foreground" href="/changelog">
							Changelog
						</TopbarButton>
					</div>

					<div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
						<SearchBar catalog={searchCatalog} />
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
