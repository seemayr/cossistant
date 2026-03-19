import { MenuIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo, LogoText } from "@/components/ui/logo";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
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
import { FullWidthBorder } from "../full-width-border";
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
	const navigationLinks = [
		{ href: "/docs", label: "Docs" },
		{ href: "/blog", label: "Blog" },
		{ href: "/pricing", label: "Pricing" },
		{ href: "/changelog", label: "Changelog" },
	];

	return (
		<div
			className={cn(
				"fixed top-0 right-0 left-0 z-[9999] border-grid-x bg-background",
				className
			)}
		>
			<div className="container-wrapper relative mx-auto">
				<div className="container absolute top-0 right-0 left-0 z-50 mx-auto flex items-center bg-background py-4 lg:justify-between">
					<div className="flex items-center gap-3 sm:gap-6">
						<Sheet>
							<SheetTrigger asChild>
								<Button
									className="size-8 border border-dashed md:hidden"
									size="icon"
									type="button"
									variant="ghost"
								>
									<MenuIcon className="size-4" />
									<span className="sr-only">Open navigation menu</span>
								</Button>
							</SheetTrigger>
							<SheetContent className="w-full border-dashed bg-background p-6 sm:max-w-sm">
								<SheetHeader>
									<SheetTitle>Navigation</SheetTitle>
									<SheetDescription>
										Browse docs, product pages, and updates.
									</SheetDescription>
								</SheetHeader>
								<div className="mt-6 flex flex-col gap-2 px-2">
									{navigationLinks.map((link) => (
										<SheetClose asChild key={link.href}>
											<Link
												className="rounded-sm px-2 py-2 font-medium text-sm transition-colors hover:bg-secondary"
												href={link.href}
											>
												{link.label}
											</Link>
										</SheetClose>
									))}
								</div>
								{children ? (
									<div className="mt-6 flex flex-wrap items-center gap-3">
										{children}
									</div>
								) : null}
							</SheetContent>
						</Sheet>
						<div className="w-14 lg:w-[280px]">
							<Link className="flex items-center" href="/">
								<LogoText className="hidden lg:flex" />
								<Logo className="size-5.5 text-primary lg:hidden" />
							</Link>
						</div>
					</div>
					<div className="hidden items-center space-x-4 md:flex lg:flex-1 lg:justify-center">
						{navigationLinks.map((link) => (
							<TopbarButton
								className="text-foreground"
								href={link.href}
								key={link.href}
							>
								{link.label}
							</TopbarButton>
						))}
					</div>

					<div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:gap-3">
						<SearchBar catalog={searchCatalog} />
						<div className="hidden items-center gap-2 md:flex">{children}</div>
					</div>
					<FullWidthBorder className="bottom-0" />
				</div>
				<div className="pointer-events-none absolute top-0 right-0 left-0 z-10 h-20 bg-linear-to-b from-background to-transparent" />
				<div className="pointer-events-none absolute top-0 right-0 left-0 z-10 h-24 bg-linear-to-b from-background to-transparent" />
				<div className="pointer-events-none absolute top-0 right-0 left-0 z-10 h-32 bg-linear-to-b from-background to-transparent" />
			</div>
		</div>
	);
}
