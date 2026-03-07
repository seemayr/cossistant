import { findNeighbour } from "fumadocs-core/page-tree";
// TODO: Uncomment when OpenAPI docs are needed (requires fumadocs-openapi v10 migration)
// import { APIPage } from "../../components/docs/api-page";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { GITHUB_URL } from "@/constants";
import {
	buildBreadcrumbJsonLd,
	buildTechArticleJsonLd,
	docPage,
} from "@/lib/metadata";
import { getDocsData } from "@/lib/seo-content";
import { source } from "@/lib/source";
import { DocsTableOfContents } from "../../components/docs/docs-toc";
import { mdxComponents } from "../../components/docs/mdx-components";
import { LLMCopyButton, ViewOptions } from "../../components/page-actions";

export const revalidate = false;
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
	return source.generateParams();
}

type DocsPage = NonNullable<ReturnType<typeof source.getPage>>;

function humanizeSegment(segment: string): string {
	return segment
		.split("-")
		.map((part) => {
			if (part.toLowerCase() === "api") {
				return "API";
			}

			if (part.toLowerCase() === "ai") {
				return "AI";
			}

			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(" ");
}

function buildDocsBreadcrumbs(page: DocsPage) {
	const breadcrumbs = [
		{ name: "Home", path: "/" },
		{ name: "Docs", path: "/docs" },
	];

	if (page.slugs.length === 0) {
		return breadcrumbs;
	}

	let currentPath = "/docs";

	for (const [index, segment] of page.slugs.entries()) {
		currentPath = `${currentPath}/${segment}`;
		const isLast = index === page.slugs.length - 1;
		breadcrumbs.push({
			name: isLast ? getDocsData(page).title : humanizeSegment(segment),
			path: currentPath,
		});
	}

	return breadcrumbs;
}

export async function generateMetadata(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);

	if (!page) {
		notFound();
	}

	const doc = getDocsData(page);

	if (!(doc.title && doc.description)) {
		notFound();
	}

	return docPage({
		title: doc.title,
		description: doc.description,
		path: page.url,
		canonical: doc.canonical,
		image:
			doc.image ||
			`/og?title=${encodeURIComponent(doc.title)}&description=${encodeURIComponent(doc.description)}`,
		keywords: doc.keywords ?? doc.search?.tags,
		noIndex: doc.noindex,
	});
}

export default async function Page(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);

	if (!page) {
		notFound();
	}

	// TODO: Uncomment when OpenAPI docs are needed (requires fumadocs-openapi v10 migration)
	// if (page.data.type === "openapi") {
	// 	return (
	// 		<div>
	// 			<h1 className="font-semibold text-[1.75em]">{page.data.title}</h1>
	// 			<p className="mb-6 text-fd-muted-foreground">{page.data.description}</p>
	// 			<APIPage {...page.data.getAPIPageProps()} />
	// 		</div>
	// 	);
	// }

	const doc = getDocsData(page);
	const MDX = doc.body;

	const neighbours = await findNeighbour(source.pageTree, page.url);

	const links = (doc as { links?: { doc?: string; api?: string } }).links;

	const breadcrumbs = buildDocsBreadcrumbs(page);

	return (
		<div
			className="flex items-stretch py-20 pb-120 text-[1.05rem] sm:text-[15px] xl:w-full"
			data-slot="docs"
		>
			<JsonLdScripts
				data={[
					buildTechArticleJsonLd({
						title: doc.title,
						description: doc.description,
						path: page.url,
						image:
							doc.image ||
							`/og?title=${encodeURIComponent(doc.title)}&description=${encodeURIComponent(doc.description)}`,
						keywords: doc.keywords ?? doc.search?.tags,
						dateModified: doc.updatedAt ?? doc.lastModified,
					}),
					buildBreadcrumbJsonLd(breadcrumbs),
				]}
				idPrefix="docs-jsonld"
			/>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="h-(--top-spacing) shrink-0" />
				<div className="mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col gap-8 px-4 py-6 text-neutral-800 md:px-0 lg:py-8 dark:text-neutral-300">
					<div className="flex flex-col gap-2">
						<div className="flex flex-col gap-2">
							<div className="flex items-start justify-between">
								<h1 className="scroll-m-20 font-medium text-4xl tracking-tight sm:text-3xl xl:text-4xl">
									{doc.title}
								</h1>
								<div className="flex items-center gap-2 pt-1.5">
									{neighbours.previous && (
										<Button
											asChild
											className="extend-touch-target size-8 shadow-none md:size-7"
											size="icon"
											variant="secondary"
										>
											<Link href={neighbours.previous.url}>
												<Icon name="arrow-left" />
												<span className="sr-only">Previous</span>
											</Link>
										</Button>
									)}
									{neighbours.next && (
										<Button
											asChild
											className="extend-touch-target size-8 shadow-none md:size-7"
											size="icon"
											variant="secondary"
										>
											<Link href={neighbours.next.url}>
												<span className="sr-only">Next</span>
												<Icon name="arrow-right" />
											</Link>
										</Button>
									)}
								</div>
							</div>
							{doc.description && (
								<p className="text-balance text-[1.05rem] text-muted-foreground sm:text-base">
									{doc.description}
								</p>
							)}
						</div>
						{links ? (
							<div className="flex items-center space-x-2 pt-4">
								{links?.doc && (
									<Badge asChild variant="secondary">
										<Link href={links.doc} rel="noreferrer" target="_blank">
											Docs <Icon name="arrow-up-right" />
										</Link>
									</Badge>
								)}
								{links?.api && (
									<Badge asChild variant="secondary">
										<Link href={links.api} rel="noreferrer" target="_blank">
											API Reference <Icon name="arrow-up-right" />
										</Link>
									</Badge>
								)}
							</div>
						) : null}
					</div>
					<div className="w-full flex-1 *:data-[slot=alert]:first:mt-0">
						<MDX components={mdxComponents} />
					</div>
				</div>
				<div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-2 px-4 md:px-0">
					{neighbours.previous && (
						<Button
							asChild
							className="shadow-none"
							size="sm"
							variant="secondary"
						>
							<Link href={neighbours.previous.url}>
								<Icon name="arrow-left" /> {neighbours.previous.name}
							</Link>
						</Button>
					)}
					{neighbours.next && (
						<Button
							asChild
							className="ml-auto shadow-none"
							size="sm"
							variant="secondary"
						>
							<Link href={neighbours.next.url}>
								{neighbours.next.name} <Icon name="arrow-right" />
							</Link>
						</Button>
					)}
				</div>
			</div>
			<div className="sticky top-[calc(var(--header-height)+1px)] z-30 ml-auto hidden h-[calc(100svh-var(--header-height)-var(--footer-height))] w-72 flex-col gap-4 overflow-hidden overscroll-none pb-8 xl:flex">
				<div className="h-(--top-spacing) shrink-0" />
				{doc.toc?.length ? (
					<div className="no-scrollbar overflow-y-auto px-8">
						<div className="flex gap-1 pl-4">
							<LLMCopyButton markdownUrl={`${page.url}.mdx`} />
							<ViewOptions
								githubUrl={`${GITHUB_URL}/blob/main/apps/web/content/docs/${page.path}`}
								markdownUrl={`${page.url}.mdx`}
							/>
						</div>
						<Separator className="my-6 opacity-50" />
						<DocsTableOfContents toc={doc.toc} />
						<div className="h-12" />
					</div>
				) : null}
				{/* <div className="flex flex-1 flex-col gap-12 px-6">
          <OpenInV0Cta />
        </div> */}
			</div>
		</div>
	);
}
