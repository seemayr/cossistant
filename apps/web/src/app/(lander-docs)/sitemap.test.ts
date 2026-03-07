import { describe, expect, it } from "bun:test";
import { getAllBlogTags, getIndexableBlogTags } from "@/lib/seo-content";
import sitemap from "./sitemap";

describe("lander-docs sitemap", () => {
	it("includes current indexable tag pages and excludes non-indexable plus utility pages", async () => {
		const entries = await sitemap();
		const urls = entries.map((entry) => entry.url);
		const indexableTags = getIndexableBlogTags();
		const nonIndexableTags = getAllBlogTags().filter(
			(tag) => !indexableTags.includes(tag)
		);

		expect(urls).toContain("http://localhost:3000/");
		expect(urls).toContain("http://localhost:3000/blog");
		expect(urls).toContain("http://localhost:3000/docs");
		expect(urls).toContain("http://localhost:3000/blog/introducing-cossistant");
		for (const tag of indexableTags) {
			expect(urls).toContain(
				`http://localhost:3000/blog/tag/${encodeURIComponent(tag)}`
			);
		}
		for (const tag of nonIndexableTags) {
			expect(urls).not.toContain(
				`http://localhost:3000/blog/tag/${encodeURIComponent(tag)}`
			);
		}
		expect(urls).not.toContain("http://localhost:3000/login");
		expect(urls).not.toContain("http://localhost:3000/sign-up");
		expect(urls).not.toContain("http://localhost:3000/changelog/page/2");
	});
});
