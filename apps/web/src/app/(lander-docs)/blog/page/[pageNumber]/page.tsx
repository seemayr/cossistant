import { format } from "date-fns";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { blogCollection, buildCollectionPageJsonLd } from "@/lib/metadata";
import { getPublishedBlogPosts } from "@/lib/seo-content";

export const revalidate = false;
export const dynamic = "force-static";
export const dynamicParams = false;

const GRID_COUNT = 3;
const LIST_PER_PAGE = 6;

type BlogPage = ReturnType<typeof getPublishedBlogPosts>[number];

export function generateStaticParams() {
	const allPosts = getPublishedBlogPosts();
	// Hero (1) + Grid (3) = 4 posts on first page
	const remainingPosts = allPosts.length - 1 - GRID_COUNT;
	const totalPages = Math.ceil(remainingPosts / LIST_PER_PAGE);

	if (totalPages <= 1) {
		return [];
	}

	return Array.from({ length: totalPages - 1 }, (_, i) => ({
		pageNumber: String(i + 2),
	}));
}

export async function generateMetadata(props: {
	params: Promise<{ pageNumber: string }>;
}) {
	const params = await props.params;
	const pageNumber = Number.parseInt(params.pageNumber, 10);

	const title = `Blog - Page ${pageNumber}`;
	const description =
		"Insights, tutorials, and updates about AI-powered customer support and the Cossistant platform.";

	return blogCollection({
		title,
		description,
		path: `/blog/page/${pageNumber}`,
		image: `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
		noIndex: true,
		follow: true,
	});
}

function BlogListItem({ post }: { post: BlogPage }) {
	const date = new Date(post.data.date);

	return (
		<Link
			className="group flex gap-6 border-primary/10 border-b border-dashed py-6 transition-colors last:border-b-0"
			href={post.url}
		>
			<div className="flex flex-1 flex-col gap-2">
				<h3 className="font-medium text-lg tracking-tight transition-colors group-hover:text-primary">
					{post.data.title}
				</h3>
				<p className="line-clamp-2 text-muted-foreground text-sm">
					{post.data.description}
				</p>
				<div className="mt-auto flex items-center gap-4 pt-2">
					<div className="flex items-center gap-2">
						<div className="flex size-5 items-center justify-center rounded-full bg-background-300 font-medium text-xs">
							{post.data.author.charAt(0)}
						</div>
						<span className="text-muted-foreground text-sm">
							{post.data.author}
						</span>
					</div>
					<time
						className="font-mono text-muted-foreground text-xs"
						dateTime={post.data.date}
					>
						{format(date, "MMM d, yyyy")}
					</time>
				</div>
			</div>
			<Icon
				className="mt-1.5 size-4 text-muted-foreground transition-transform group-hover:translate-x-1"
				name="arrow-right"
			/>
		</Link>
	);
}

export default async function BlogPaginatedPage(props: {
	params: Promise<{ pageNumber: string }>;
}) {
	const params = await props.params;
	const pageNumber = Number.parseInt(params.pageNumber, 10);

	// Redirect page 1 to /blog
	if (pageNumber === 1) {
		redirect("/blog");
	}

	const allPosts = getPublishedBlogPosts();

	// Calculate pagination
	// Page 1 shows: 1 hero + 3 grid + 6 list = 10 posts
	// Page 2+ shows: 6 list posts each
	const firstPagePosts = 1 + GRID_COUNT + LIST_PER_PAGE;
	const remainingAfterFirstPage = allPosts.length - firstPagePosts;
	const totalPages =
		1 + Math.ceil(Math.max(0, remainingAfterFirstPage) / LIST_PER_PAGE);

	// 404 for invalid page numbers
	if (pageNumber < 1 || pageNumber > totalPages) {
		notFound();
	}

	// Calculate start index for this page
	const startIndex = firstPagePosts + (pageNumber - 2) * LIST_PER_PAGE;
	const posts = allPosts.slice(startIndex, startIndex + LIST_PER_PAGE);

	const hasPreviousPage = pageNumber > 1;
	const hasNextPage = pageNumber < totalPages;
	const previousPageUrl =
		pageNumber === 2 ? "/blog" : `/blog/page/${pageNumber - 1}`;

	return (
		<div className="flex flex-col py-20 pb-40">
			<JsonLdScripts
				data={buildCollectionPageJsonLd({
					title: `Blog - Page ${pageNumber}`,
					description:
						"Insights, tutorials, and updates about AI-powered customer support and the Cossistant platform.",
					path: `/blog/page/${pageNumber}`,
				})}
				idPrefix="blog-page-jsonld"
			/>
			<div className="mx-auto w-full max-w-5xl px-4 md:px-0">
				{/* Header */}
				<header className="mb-12">
					<h1 className="font-medium text-4xl tracking-tight">Blog</h1>
					<p className="mt-4 max-w-2xl text-lg text-muted-foreground">
						Insights, tutorials, and updates about AI-powered customer support.
					</p>
					<p className="mt-2 text-muted-foreground text-sm">
						Page {pageNumber}
					</p>
				</header>

				{/* List Section */}
				<section>
					<div className="flex flex-col">
						{posts.map((post) => (
							<BlogListItem key={post.url} post={post} />
						))}
					</div>
				</section>

				{/* Pagination */}
				<nav className="mt-12 flex items-center justify-between">
					{hasPreviousPage ? (
						<Button
							asChild
							className="shadow-none"
							size="sm"
							variant="secondary"
						>
							<Link href={previousPageUrl}>
								<Icon name="arrow-left" /> Newer posts
							</Link>
						</Button>
					) : (
						<div />
					)}
					{hasNextPage ? (
						<Button
							asChild
							className="shadow-none"
							size="sm"
							variant="secondary"
						>
							<Link href={`/blog/page/${pageNumber + 1}`}>
								Older posts <Icon name="arrow-right" />
							</Link>
						</Button>
					) : (
						<div />
					)}
				</nav>
			</div>
		</div>
	);
}
