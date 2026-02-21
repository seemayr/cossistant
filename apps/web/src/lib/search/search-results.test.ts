import { describe, expect, it } from "bun:test";
import type { SearchCatalogMap } from "@/lib/search/search-metadata";
import {
	buildTopbarQuickLinks,
	splitMarkedContent,
	stripMarkTags,
	TOPBAR_QUICK_LINKS,
} from "./search-results";

describe("search results helpers", () => {
	it("strips mark tags from search content", () => {
		expect(stripMarkTags("Use <mark>support</mark> widget")).toBe(
			"Use support widget"
		);
		expect(stripMarkTags("<mark>Support</mark></mark>")).toBe("Support");
	});

	it("returns plain segment when no marks are present", () => {
		expect(splitMarkedContent("Support widget")).toEqual([
			{ text: "Support widget", highlighted: false },
		]);
	});

	it("splits highlighted content into text segments", () => {
		expect(splitMarkedContent("Use <mark>support</mark> widget")).toEqual([
			{ text: "Use ", highlighted: false },
			{ text: "support", highlighted: true },
			{ text: " widget", highlighted: false },
		]);
	});

	it("supports multiple highlighted sections", () => {
		expect(
			splitMarkedContent("<mark>Use</mark> the <mark>Support</mark> component")
		).toEqual([
			{ text: "Use", highlighted: true },
			{ text: " the ", highlighted: false },
			{ text: "Support", highlighted: true },
			{ text: " component", highlighted: false },
		]);
	});

	it("falls back to plain text when mark tags are malformed", () => {
		expect(splitMarkedContent("Use <mark>support in docs")).toEqual([
			{ text: "Use support in docs", highlighted: false },
		]);
	});

	it("builds default quick links in fixed order with metadata enrichment", () => {
		const catalog: SearchCatalogMap = {
			"/docs/support-component": {
				url: "/docs/support-component",
				source: "docs",
				kind: "component",
				title: "Basic usage",
				description: "Basic usage of the Support component.",
				tags: ["docs", "component"],
				aliases: ["SupportProvider"],
			},
		};

		const links = buildTopbarQuickLinks(catalog);

		expect(links.map((link) => link.label)).toEqual(
			TOPBAR_QUICK_LINKS.map((link) => link.label)
		);
		expect(links.map((link) => link.url)).toEqual(
			TOPBAR_QUICK_LINKS.map((link) => link.url)
		);
		expect(links.every((link) => link.source === "docs")).toBe(true);
		expect(links[2]?.kind).toBe("component");
		expect(links[2]?.description).toBe("Basic usage of the Support component.");
	});
});
