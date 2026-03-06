import { describe, expect, it } from "bun:test";
import { generateMetadata as blogArticleMetadata } from "./blog/[slug]/page";
import { generateMetadata as blogMetadata } from "./blog/page";
import { generateMetadata as blogTagMetadata } from "./blog/tag/[tag]/page";
import { generateMetadata as changelogMetadata } from "./changelog/page";
import { generateMetadata as docsMetadata } from "./docs/[[...slug]]/page";
import { metadata as loginMetadata } from "./login/page";
import { metadata as homeMetadata } from "./page";
import { metadata as pricingMetadata } from "./pricing/page";

describe("lander-docs seo routes", () => {
	it("sets dedicated homepage metadata", () => {
		expect(homeMetadata.alternates?.canonical).toBe("http://localhost:3000/");
		expect(homeMetadata.title).toBe(
			"AI Support Framework for React and Next.js"
		);
	});

	it("sets canonical pricing metadata", () => {
		expect(pricingMetadata.alternates?.canonical).toBe(
			"http://localhost:3000/pricing"
		);
	});

	it("uses shared metadata for the blog index", () => {
		const metadata = blogMetadata();

		expect(metadata.alternates?.canonical).toBe("http://localhost:3000/blog");
		expect(metadata.openGraph && "type" in metadata.openGraph).toBe(true);
	});

	it("builds article metadata for blog posts", async () => {
		const metadata = await blogArticleMetadata({
			params: Promise.resolve({ slug: "introducing-cossistant" }),
		});

		expect(metadata.alternates?.canonical).toBe(
			"http://localhost:3000/blog/introducing-cossistant"
		);
		expect(metadata.openGraph && "type" in metadata.openGraph).toBe(true);
	});

	it("keeps thin tag pages out of the index", async () => {
		const metadata = await blogTagMetadata({
			params: Promise.resolve({ tag: "react" }),
		});

		expect(metadata.robots).toMatchObject({
			index: false,
			follow: true,
		});
	});

	it("builds docs page metadata with canonical and article og type", async () => {
		const metadata = await docsMetadata({
			params: Promise.resolve({ slug: ["quickstart"] }),
		});

		expect(metadata.alternates?.canonical).toBe(
			"http://localhost:3000/docs/quickstart"
		);
		expect(metadata.openGraph && "type" in metadata.openGraph).toBe(true);
	});

	it("builds changelog collection metadata", () => {
		const metadata = changelogMetadata();

		expect(metadata.alternates?.canonical).toBe(
			"http://localhost:3000/changelog"
		);
	});

	it("marks auth routes as noindex", () => {
		expect(loginMetadata.robots).toMatchObject({
			index: false,
			follow: false,
		});
	});
});
