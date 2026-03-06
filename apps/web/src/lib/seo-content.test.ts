import { describe, expect, it } from "bun:test";
import {
	buildDocsLlmsIndexText,
	getIndexableBlogTags,
	validateSeoContent,
	validateSeoEntry,
} from "./seo-content";

describe("seo content helpers", () => {
	it("keeps current tag archives out of the sitemap until they meet the threshold", () => {
		expect(getIndexableBlogTags()).toEqual([]);
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
});
