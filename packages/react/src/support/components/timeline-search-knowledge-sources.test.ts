import { describe, expect, it } from "bun:test";
import { extractWidgetSources } from "./timeline-search-knowledge-sources";

describe("extractWidgetSources", () => {
	it("collapses normalized URL duplicates and ignores invalid or non-url entries", () => {
		expect(
			extractWidgetSources({
				success: true,
				data: {
					articles: [
						{
							title: "Billing FAQ",
							sourceUrl: "https://example.com/billing",
							sourceType: "url",
						},
						{
							title: "Billing FAQ Duplicate",
							sourceUrl: "https://example.com/billing/",
							sourceType: "url",
						},
						{
							sourceUrl: "https://docs.example.com/pricing",
							sourceType: "url",
						},
						{
							title: "Internal FAQ",
							sourceUrl: "https://example.com/internal-faq",
							sourceType: "faq",
						},
						{
							title: "Broken link",
							sourceUrl: "not-a-url",
							sourceType: "url",
						},
					],
				},
			})
		).toEqual([
			{
				key: "url:https://example.com/billing",
				label: "Billing FAQ",
				href: "https://example.com/billing",
			},
			{
				key: "url:https://docs.example.com/pricing",
				label: "docs.example.com/pricing",
				href: "https://docs.example.com/pricing",
			},
		]);
	});

	it("keeps repeated titles when the source URLs differ", () => {
		const sources = extractWidgetSources({
			success: true,
			data: {
				articles: [
					{
						title: "Pricing",
						sourceUrl: "https://example.com/pricing",
						sourceType: "url",
					},
					{
						title: "Pricing",
						sourceUrl: "https://docs.example.com/pricing",
						sourceType: "url",
					},
				],
			},
		});

		expect(sources).toHaveLength(2);
		expect(sources[0]).toEqual({
			key: "url:https://example.com/pricing",
			label: "Pricing",
			href: "https://example.com/pricing",
		});
		expect(sources[1]).toEqual({
			key: "url:https://docs.example.com/pricing",
			label: "Pricing",
			href: "https://docs.example.com/pricing",
		});
		expect(sources[0]?.key).not.toBe(sources[1]?.key);
	});
});
