import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icons";
import { blogCollection, buildCollectionPageJsonLd } from "@/lib/metadata";
import {
	getAllBlogTags,
	getBlogTagIntro,
	getPostsByTag,
	isBlogTagIndexable,
} from "@/lib/seo-content";

export const revalidate = false;
export const dynamic = "force-static";
export const dynamicParams = false;

type BlogPage = ReturnType<typeof getPostsByTag>[number];

export function generateStaticParams() {
	const tags = getAllBlogTags();
	return tags.map((tag) => ({
		tag: encodeURIComponent(tag),
	}));
}

export async function generateMetadata(props: {
	params: Promise<{ tag: string }>;
}) {
	const params = await props.params;
	const tag = decodeURIComponent(params.tag);
	const posts = getPostsByTag(tag);
	const intro = getBlogTagIntro(tag);

	if (posts.length === 0) {
		return {};
	}

	const title = `Articles tagged "${tag}"`;
	const description =
		intro ||
		`Browse ${posts.length} article${posts.length === 1 ? "" : "s"} about ${tag} on the Cossistant blog.`;

	return blogCollection({
		title,
		description,
		path: `/blog/tag/${encodeURIComponent(tag)}`,
		image: `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
		noIndex: !isBlogTagIndexable(tag),
		follow: true,
		keywords: [tag, "Cossistant blog"],
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

export default async function BlogTagPage(props: {
	params: Promise<{ tag: string }>;
}) {
	const params = await props.params;
	const tag = decodeURIComponent(params.tag);
	const posts = getPostsByTag(tag);

	if (posts.length === 0) {
		notFound();
	}

	// Get all tags for the tag cloud
	const allTags = getAllBlogTags();

	return (
		<div className="flex flex-col py-20 pb-40">
			<JsonLdScripts
				data={buildCollectionPageJsonLd({
					title: `Articles tagged "${tag}"`,
					description:
						getBlogTagIntro(tag) ||
						`Browse ${posts.length} article${posts.length === 1 ? "" : "s"} about ${tag} on the Cossistant blog.`,
					path: `/blog/tag/${encodeURIComponent(tag)}`,
				})}
				idPrefix="blog-tag-jsonld"
			/>
			<div className="mx-auto w-full max-w-5xl px-4 md:px-0">
				{/* Header */}
				<header className="mt-10 mb-12">
					<Link
						className="mb-4 inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
						href="/blog"
					>
						<Icon className="size-4" name="arrow-left" />
						Back to Blog
					</Link>
					<h1 className="font-medium text-4xl tracking-tight">
						Articles tagged "{tag}"
					</h1>
					<p className="mt-4 text-lg text-muted-foreground">
						{posts.length} article{posts.length === 1 ? "" : "s"} found
					</p>
				</header>

				{/* Tag Cloud */}
				<div className="mb-8 flex flex-wrap gap-2">
					{allTags.map((t) => (
						<Badge
							asChild
							className={
								t.toLowerCase() === tag.toLowerCase()
									? "bg-primary text-primary-foreground"
									: ""
							}
							key={t}
							variant={
								t.toLowerCase() === tag.toLowerCase() ? "default" : "secondary"
							}
						>
							<Link href={`/blog/tag/${encodeURIComponent(t)}`}>{t}</Link>
						</Badge>
					))}
				</div>

				{/* Separator */}
				<div className="relative mb-8">
					<div className="-translate-x-1/2 absolute top-0 left-1/2 w-screen border-primary/10 border-t border-dashed" />
				</div>

				{/* Articles List */}
				<section>
					<div className="flex flex-col">
						{posts.map((post) => (
							<BlogListItem key={post.url} post={post} />
						))}
					</div>
				</section>
			</div>
		</div>
	);
}
