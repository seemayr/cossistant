import { describe, expect, it } from "bun:test";
import sitemap from "./sitemap";

describe("lander-docs sitemap", () => {
	it("includes core indexable pages and excludes utility pages", async () => {
		const entries = await sitemap();
		const urls = entries.map((entry) => entry.url);

		expect(urls).toContain("http://localhost:3000/");
		expect(urls).toContain("http://localhost:3000/blog");
		expect(urls).toContain("http://localhost:3000/docs");
		expect(urls).toContain("http://localhost:3000/blog/introducing-cossistant");
		expect(urls).not.toContain("http://localhost:3000/login");
		expect(urls).not.toContain("http://localhost:3000/sign-up");
		expect(urls).not.toContain("http://localhost:3000/blog/tag/react");
		expect(urls).not.toContain("http://localhost:3000/changelog/page/2");
	});
});
