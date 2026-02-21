"use client";

import { useDocsSearch } from "fumadocs-core/search/client";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import {
	buildTopbarQuickLinks,
	splitMarkedContent,
	stripMarkTags,
} from "@/lib/search/search-results";
import { cn } from "@/lib/utils";

type SearchResult = {
	id: string;
	url: string;
	type: "page" | "heading" | "text";
	content: string;
	breadcrumbs?: string[];
};

type SearchResultItem = SearchResult & {
	plainContent: string;
	source: SearchSource;
	sourceLabel: string;
	kind: SearchKind;
	kindLabel: string;
	pageTitle?: string;
	description?: string;
	tags: string[];
	aliases: string[];
};

const SEARCH_SOURCE_ORDER: SearchSource[] = [
	"docs",
	"blog",
	"changelog",
	"other",
];

function isEditableElement(target: EventTarget | null): boolean {
	if (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	) {
		return true;
	}

	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return target.isContentEditable;
}

function SearchKey({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-5 min-w-5 items-center justify-center border border-primary/10 border-dashed bg-background-100 px-1 font-mono text-[10px] text-muted-foreground leading-none",
				className
			)}
		>
			{children}
		</span>
	);
}

function HighlightedSearchContent({ content }: { content: string }) {
	const parts = splitMarkedContent(content);

	return (
		<>
			{parts.map((part, index) =>
				part.highlighted ? (
					<mark className="bg-primary/15 px-0.5 text-foreground" key={index}>
						{part.text}
					</mark>
				) : (
					<React.Fragment key={index}>{part.text}</React.Fragment>
				)
			)}
		</>
	);
}

export function SearchBar({ catalog }: { catalog: SearchCatalogMap }) {
	const router = useRouter();
	const [open, setOpen] = React.useState(false);
	const { search, setSearch, query } = useDocsSearch({
		type: "fetch",
		api: "/api/search",
		delayMs: 180,
	});
	const quickLinks = React.useMemo(
		() => buildTopbarQuickLinks(catalog),
		[catalog]
	);
	const trimmedSearch = search.trim();

	React.useEffect(() => {
		if (open) {
			return;
		}

		setSearch("");
	}, [open, setSearch]);

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const shouldOpenCommand =
				(event.key === "k" && (event.metaKey || event.ctrlKey)) ||
				(event.key === "/" &&
					!event.metaKey &&
					!event.ctrlKey &&
					!event.altKey);

			if (!shouldOpenCommand) {
				return;
			}

			if (isEditableElement(event.target)) {
				return;
			}

			event.preventDefault();
			setOpen((previous) => !previous);
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const resultItems = React.useMemo<SearchResultItem[]>(() => {
		if (!Array.isArray(query.data)) {
			return [];
		}

		const deduped = new Set<string>();
		const items: SearchResultItem[] = [];

		for (const rawResult of query.data as SearchResult[]) {
			const content = rawResult.content.trim();
			const plainContent = stripMarkTags(content).trim();
			if (!plainContent) {
				continue;
			}

			if (rawResult.type === "text" && plainContent.split(/\s+/).length <= 1) {
				continue;
			}

			const dedupeKey = `${rawResult.url}:${rawResult.type}:${plainContent.toLowerCase()}`;
			if (deduped.has(dedupeKey)) {
				continue;
			}
			deduped.add(dedupeKey);

			const baseUrl = stripHash(rawResult.url);
			const catalogEntry = catalog[baseUrl];
			const source = catalogEntry?.source ?? inferSourceFromUrl(rawResult.url);
			const kind =
				catalogEntry?.kind ??
				inferFallbackKind({
					source,
					url: baseUrl,
					title: catalogEntry?.title ?? plainContent,
				});

			items.push({
				...rawResult,
				content,
				plainContent,
				source,
				sourceLabel: SEARCH_SOURCE_LABELS[source],
				kind,
				kindLabel: SEARCH_KIND_LABELS[kind],
				pageTitle: catalogEntry?.title,
				description: catalogEntry?.description,
				tags: catalogEntry?.tags ?? [],
				aliases: catalogEntry?.aliases ?? [],
			});
		}

		return items;
	}, [catalog, query.data]);

	const groupedResults = React.useMemo(() => {
		const grouped: Record<SearchSource, SearchResultItem[]> = {
			docs: [],
			blog: [],
			changelog: [],
			other: [],
		};

		for (const item of resultItems) {
			grouped[item.source].push(item);
		}

		return grouped;
	}, [resultItems]);

	const onSelectResult = React.useCallback(
		(url: string) => {
			setOpen(false);
			router.push(url);
		},
		[router]
	);

	return (
		<>
			<Button
				className="h-7 w-[84px] justify-start rounded-none border border-primary/10 border-dashed bg-background px-2 font-normal text-muted-foreground shadow-none hover:bg-background-200 sm:w-[140px] dark:bg-background-50"
				onClick={() => setOpen(true)}
				type="button"
				variant="ghost"
			>
				<span className="truncate text-xs">Search...</span>
			</Button>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent
					className="top-[18%] w-[calc(100%-1.5rem)] translate-x-[-50%] translate-y-0 gap-0 rounded-none border border-primary/10 border-dashed bg-background p-0 shadow-2xl sm:max-w-[760px]"
					showCloseButton={false}
				>
					<DialogHeader className="sr-only">
						<DialogTitle>Search Cossistant</DialogTitle>
						<DialogDescription>
							Find docs, blog posts, and changelog entries.
						</DialogDescription>
					</DialogHeader>
					<Command
						className={cn(
							"rounded-none bg-transparent",
							"**:data-[slot=command-input-wrapper]:h-10",
							"**:data-[slot=command-input-wrapper]:border-b",
							"**:data-[slot=command-input-wrapper]:border-primary/10",
							"**:data-[slot=command-input-wrapper]:border-dashed",
							"**:data-[slot=command-input-wrapper]:bg-background-100",
							"**:data-[slot=command-input-wrapper]:mb-0",
							"**:data-[slot=command-input-wrapper]:px-3",
							"**:data-[slot=command-input]:h-10",
							"**:data-[slot=command-input]:py-0",
							"**:data-[slot=command-input]:text-sm"
						)}
					>
						<div className="relative">
							<CommandInput
								onValueChange={setSearch}
								placeholder="Search docs, blog, changelog..."
								value={search}
							/>
							{query.isLoading && (
								<div className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3">
									<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
								</div>
							)}
						</div>
						<CommandList className="max-h-[420px] overflow-y-auto py-1">
							<CommandEmpty className="py-8 text-center text-muted-foreground text-sm">
								{trimmedSearch.length > 0 && query.isLoading
									? "Searching..."
									: "No results found."}
							</CommandEmpty>
							{trimmedSearch.length === 0 ? (
								<CommandGroup
									className="p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
									heading="Quick Links"
								>
									{quickLinks.map((item) => (
										<CommandItem
											className="h-auto min-h-12 items-start rounded-none border border-transparent px-2 py-2 text-left font-normal data-[selected=true]:border-primary/20 data-[selected=true]:bg-background-200 data-[selected=true]:text-foreground"
											key={`quick-link:${item.url}`}
											keywords={[
												item.sourceLabel,
												item.kindLabel,
												item.pageTitle ?? item.label,
												...item.tags,
												...item.aliases,
											]}
											onSelect={() => onSelectResult(item.url)}
											value={`${item.label} ${item.sourceLabel} ${item.kindLabel} ${item.pageTitle ?? ""}`}
										>
											<div className="flex min-w-0 flex-1 flex-col gap-1">
												<div className="line-clamp-1 text-sm">{item.label}</div>
												<div className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
													<span className="rounded-none border border-primary/10 border-dashed bg-background-100 px-1 py-0.5 font-mono text-[10px] uppercase leading-none">
														{item.sourceLabel}
													</span>
													<span className="rounded-none border border-primary/10 border-dashed bg-background-100 px-1 py-0.5 font-mono text-[10px] uppercase leading-none">
														{item.kindLabel}
													</span>
													{item.description ? (
														<span className="truncate">{item.description}</span>
													) : item.pageTitle ? (
														<span className="truncate">{item.pageTitle}</span>
													) : null}
												</div>
											</div>
										</CommandItem>
									))}
								</CommandGroup>
							) : null}
							{SEARCH_SOURCE_ORDER.map((sourceKey) => {
								const items = groupedResults[sourceKey];
								if (items.length === 0) {
									return null;
								}

								return (
									<CommandGroup
										className="p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
										heading={SEARCH_SOURCE_LABELS[sourceKey]}
										key={sourceKey}
									>
										{items.map((item) => (
											<CommandItem
												className="h-auto min-h-12 items-start rounded-none border border-transparent px-2 py-2 text-left font-normal data-[selected=true]:border-primary/20 data-[selected=true]:bg-background-200 data-[selected=true]:text-foreground"
												key={`${item.id}:${item.url}`}
												keywords={[
													item.sourceLabel,
													item.kindLabel,
													item.pageTitle ?? "",
													...item.tags,
													...item.aliases,
												]}
												onSelect={() => onSelectResult(item.url)}
												value={`${item.plainContent} ${item.sourceLabel} ${item.kindLabel} ${item.pageTitle ?? ""}`}
											>
												<div className="flex min-w-0 flex-1 flex-col gap-1">
													<div className="line-clamp-1 text-sm">
														<HighlightedSearchContent content={item.content} />
													</div>
													<div className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
														<span className="border border-primary/10 border-dashed bg-background-100 px-1 py-0.5 font-mono text-[10px] uppercase leading-none">
															{item.sourceLabel}
														</span>
														<span className="border border-primary/10 border-dashed bg-background-100 px-1 py-0.5 font-mono text-[10px] uppercase leading-none">
															{item.kindLabel}
														</span>
														{item.type !== "page" && item.pageTitle ? (
															<span className="truncate">{item.pageTitle}</span>
														) : null}
													</div>
												</div>
											</CommandItem>
										))}
									</CommandGroup>
								);
							})}
						</CommandList>
					</Command>
					<div className="flex h-9 items-center justify-between border-primary/10 border-t border-dashed bg-background-100 px-3 text-muted-foreground text-xs">
						<div className="flex items-center gap-1.5">
							<SearchKey className="px-1.5">Enter</SearchKey>
							<span>Open page</span>
						</div>
						<div className="flex items-center gap-1.5">
							<SearchKey className="px-1.5">Cmd</SearchKey>
							<SearchKey className="px-1.5">K</SearchKey>
							<span>Toggle</span>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
