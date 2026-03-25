import Image from "next/image";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import {
	buildCollectionPageJsonLd,
	buildOrganizationJsonLd,
	marketing,
} from "@/lib/metadata";
import { toAbsoluteUrl } from "@/lib/site-url";
import {
	FEATURED_OPEN_SOURCE_PROJECTS,
	type FeaturedOpenSourceProject,
} from "./features";

const PAGE_TITLE = "Open Source Program";
const PAGE_DESCRIPTION =
	"Apply for a free Cossistant Pro plan for your open source project and get featured on our site.";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = marketing({
	title: PAGE_TITLE,
	description: PAGE_DESCRIPTION,
	path: "/open-source-program",
	image: `/og?title=${encodeURIComponent(PAGE_TITLE)}&description=${encodeURIComponent(PAGE_DESCRIPTION)}`,
	keywords: [
		"open source program",
		"open source sponsorship",
		"free support widget for open source",
		"customer support for open source projects",
		"oss sponsorship program",
	],
});

function buildFeaturedProjectsJsonLd(projects: FeaturedOpenSourceProject[]) {
	return {
		"@context": "https://schema.org",
		"@type": "ItemList",
		name: "Featured open source projects",
		itemListElement: projects.map((project, index) => ({
			"@type": "ListItem",
			position: index + 1,
			url: project.websiteUrl,
			name: project.name,
			image: project.ogImageUrl,
		})),
	};
}

function Section({
	id,
	title,
	description,
	children,
}: {
	id?: string;
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="px-4 py-12 md:px-0" id={id}>
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
				<div className="space-y-2">
					<h2 className="font-f37-stout text-2xl leading-tight md:text-3xl">
						{title}
					</h2>
					{description ? (
						<p className="max-w-3xl text-muted-foreground leading-7">
							{description}
						</p>
					) : null}
				</div>
				{children}
			</div>
		</section>
	);
}

export const ListItem = ({ children }: { children: React.ReactNode }) => (
	<li className="flex items-center gap-2">
		<span className="mr-1 font-bold font-mono text-cossistant-orange text-xs">
			&gt;
		</span>
		{children}
	</li>
);

export default function OpenSourceProgramPage() {
	const programUrl = toAbsoluteUrl("/open-source-program");
	const readmeSnippet = `<br />
<br />
<a href="${programUrl}">
<img alt="Cossistant OSS Program" src="https://cdn.cossistant.com/oss/oss-friends.svg" />
</a>`;

	return (
		<>
			<JsonLdScripts
				data={[
					buildOrganizationJsonLd(),
					buildCollectionPageJsonLd({
						title: PAGE_TITLE,
						description: PAGE_DESCRIPTION,
						path: "/open-source-program",
					}),
					buildFeaturedProjectsJsonLd(FEATURED_OPEN_SOURCE_PROJECTS),
				]}
				idPrefix="open-source-program-jsonld"
			/>

			<div className="px-4 pt-28 pb-16 md:px-0 md:pt-32">
				<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
					<h1 className="max-w-4xl text-balance font-f37-stout text-[40px] leading-tight md:text-6xl">
						Support your open source project users with Cossistant.
					</h1>
					<p className="max-w-3xl text-lg text-muted-foreground leading-8">
						We want to help open source projects ship better customer support.
						If your project is real and already helping people, apply to get
						Cossistant Pro plan for free and extra benefits.
					</p>
					<div className="flex flex-col gap-3 sm:flex-row">
						<Button asChild className="h-11 px-5">
							<Link href="/open-source-program/apply">
								Join the OSS friends Program
							</Link>
						</Button>
						<Button asChild className="h-11 px-5" variant="outline">
							<Link href="#featured-projects">See featured projects</Link>
						</Button>
					</div>
				</div>
			</div>

			<Section title="What you need">
				<ul className="space-y-2 text-muted-foreground leading-7">
					<ListItem>Public GitHub repository</ListItem>
					<ListItem>Recent commits and active maintenance</ListItem>
					<ListItem>
						At least one of: 100+ GitHub stars, real users or traffic, or a
						legit SaaS product built on top
					</ListItem>
					<ListItem>
						If you are profitable, tell us your MRR so we understand the project
						better
					</ListItem>
					<ListItem>
						We reserve the right to prioritize the projects that need this
						program the most
					</ListItem>
				</ul>
			</Section>

			<Section title="Simple conditions">
				<ul className="space-y-2 text-muted-foreground leading-7">
					<ListItem>Keep the Cossistant mention visible in the widget</ListItem>
					<ListItem>Add the OSS badge to your README</ListItem>
					<ListItem>
						Keep the badge linked to the Cossistant OSS program page
					</ListItem>
				</ul>

				<div className="space-y-4">
					<div className="inline-flex rounded border border-dashed px-3 py-3">
						<Image
							alt="Cossistant OSS Program badge"
							className="h-auto w-auto dark:invert"
							height={48}
							src="https://cdn.cossistant.com/oss/oss-friends.svg"
							width={220}
						/>
					</div>
					<div className="relative">
						<CopyButton
							className="top-2 right-2"
							value={readmeSnippet}
							variant="outline"
						/>
						<pre className="overflow-x-auto rounded border border-dashed px-4 py-3 pr-12 font-mono text-muted-foreground text-xs leading-6">
							<code>{readmeSnippet}</code>
						</pre>
					</div>
				</div>
			</Section>

			<Section title="What you get">
				<ul className="space-y-2 text-muted-foreground leading-7">
					<ListItem>Pro plan for free with included credits</ListItem>
					<ListItem>
						Listing on this page with a dofollow link to your site
					</ListItem>
					<ListItem>Guest blog post option if relevant</ListItem>
					<ListItem>
						Help integrating and customizing the widget by our team
					</ListItem>
				</ul>
			</Section>

			<Section id="featured-projects" title="Featured projects">
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
					{FEATURED_OPEN_SOURCE_PROJECTS.map((project) => (
						<a
							className="group flex flex-col gap-3"
							href={project.websiteUrl}
							key={project.id}
							rel="noreferrer"
							target="_blank"
						>
							<div className="overflow-hidden rounded border border-dashed">
								<Image
									alt={`${project.name} open graph image`}
									className="aspect-[1.91/1] h-auto w-full object-cover transition-transform group-hover:scale-[1.01]"
									height={630}
									src={project.ogImageUrl}
									width={1200}
								/>
							</div>
							<div className="flex items-center justify-between gap-3 text-sm">
								<span className="font-medium group-hover:text-primary">
									{project.name}
								</span>
								<span className="text-muted-foreground">Visit</span>
							</div>
						</a>
					))}
				</div>
			</Section>

			<Section
				description="The application lives on its own page so the program overview stays clean."
				title="Ready to apply?"
			>
				<div className="flex flex-col gap-3 sm:flex-row">
					<Button asChild className="h-11 px-5">
						<Link href="/open-source-program/apply">
							Apply to the OSS Program
						</Link>
					</Button>
					<Button asChild className="h-11 px-5" variant="outline">
						<Link href="#featured-projects">See featured projects</Link>
					</Button>
				</div>
			</Section>
		</>
	);
}
