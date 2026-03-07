import { describe, expect, it } from "bun:test";
import {
	buildDocsLlmsIndexText,
	getAllBlogTags,
	getBlogData,
	getBlogTagIntro,
	getIndexableBlogTags,
	getPublishedBlogPosts,
	validateSeoContent,
	validateSeoEntry,
} from "./seo-content";

describe("seo content helpers", () => {
	it("reports only tags that currently satisfy the indexability rules", () => {
		const allTags = getAllBlogTags();
		const indexableTags = getIndexableBlogTags();

		expect(indexableTags.every((tag) => allTags.includes(tag))).toBe(true);
		expect(
			allTags
				.filter((tag) => !indexableTags.includes(tag))
				.every((tag) => !indexableTags.includes(tag))
		).toBe(true);
	});

	it("passes repo content validation without hard errors", () => {
		const issues = validateSeoContent();

		expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
	});

	it("detects malformed canonical, image, and date values", () => {
		const issues = validateSeoEntry({
			path: "content/blog/broken-post",
			title: "Short",
			description: "Too short",
			canonical: "notaurl",
			image: "notaurl",
			date: "bad-date",
			updatedAt: "still-bad",
		});

		expect(issues.map((issue) => issue.code)).toEqual([
			"weak-title",
			"weak-description",
			"invalid-canonical",
			"invalid-image",
			"invalid-date",
			"invalid-updatedAt",
		]);
	});

	it("builds grouped llms index text from docs content", () => {
		const output = buildDocsLlmsIndexText();

		expect(output).toContain("# Docs");
		expect(output).toContain("[Cossistant documentation](/docs)");
		expect(output).toContain("[Next.js](/docs/quickstart)");
	});

	it("returns the same merged blog data object on repeated access", () => {
		const post = getPublishedBlogPosts().at(0);

		expect(post).toBeDefined();

		if (!post) {
			throw new Error("Expected at least one published blog post");
		}

		const first = getBlogData(post);
		const second = getBlogData(post);

		expect(first).toBe(second);
	});

	it("resolves Next.js tag intros through canonical aliases", () => {
		expect(getBlogTagIntro("nextjs")).toBe(getBlogTagIntro("Next.js"));
		expect(getBlogTagIntro("nextjs")).toBeDefined();
	});
});
