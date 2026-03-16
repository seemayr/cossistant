import { describe, expect, it } from "bun:test";
import type { KnowledgePage, LinkSource } from "@/data/link-source-cache";
import { buildMergedDomainTree } from "./utils";

function createSource(overrides: Partial<LinkSource> = {}): LinkSource {
	return {
		crawledPagesCount: 4,
		id: "source-1",
		status: "completed",
		totalSizeBytes: 4096,
		url: "https://example.com",
		...overrides,
	} as LinkSource;
}

function createPage(
	id: string,
	sourceUrl: string,
	sourceTitle: string
): KnowledgePage {
	return {
		id,
		isIncluded: true,
		sizeBytes: 1024,
		sourceTitle,
		sourceUrl,
		updatedAt: "2026-03-12T00:00:00.000Z",
	} as KnowledgePage;
}

describe("buildMergedDomainTree", () => {
	it("computes descendant counts for every node in the merged tree", () => {
		const source = createSource();
		const pagesMap = new Map<string, KnowledgePage[]>([
			[
				source.id,
				[
					createPage("page-docs", "https://example.com/docs", "Docs"),
					createPage(
						"page-getting-started",
						"https://example.com/docs/getting-started",
						"Getting Started"
					),
					createPage(
						"page-installation",
						"https://example.com/docs/getting-started/installation",
						"Installation"
					),
					createPage("page-api", "https://example.com/docs/api", "API"),
				],
			],
		]);

		const tree = buildMergedDomainTree([source], pagesMap);
		const docsNode = tree[0];
		const apiNode = docsNode?.children.find(
			(child) => child.path === "/docs/api"
		);
		const gettingStartedNode = docsNode?.children.find(
			(child) => child.path === "/docs/getting-started"
		);

		expect(tree).toHaveLength(1);
		expect(docsNode?.descendantCount).toBe(3);
		expect(apiNode?.descendantCount).toBe(0);
		expect(gettingStartedNode?.descendantCount).toBe(1);
		expect(gettingStartedNode?.children[0]?.descendantCount).toBe(0);
	});
});
