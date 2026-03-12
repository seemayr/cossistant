import { describe, expect, it } from "bun:test";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTreeItemView } from "./page-tree-item";

function renderPageTreeItem(
	props: Partial<React.ComponentProps<typeof PageTreeItemView>> = {}
) {
	return renderToStaticMarkup(
		<PageTreeItemView
			hasChildren={false}
			isExpanded={false}
			isIncluded
			path="/docs/getting-started/installation"
			sizeBytes={2048}
			title="Installation"
			treePrefix="└── "
			updatedAt="2026-03-12T00:00:00.000Z"
			url="https://example.com/docs/getting-started/installation"
			{...props}
		/>
	);
}

describe("PageTreeItemView", () => {
	it("renders only the final path segment for nested pages", () => {
		const html = renderPageTreeItem();

		expect(html).toContain(">installation</span>");
		expect(html).not.toContain("/docs/getting-started/installation</span>");
	});

	it('preserves "/" for root pages', () => {
		const html = renderPageTreeItem({
			path: "/",
			url: "https://example.com/",
		});

		expect(html).toContain(">/</span>");
	});

	it("keeps the full page URL in the existing tooltip metadata", () => {
		const html = renderPageTreeItem();

		expect(html).toContain(
			'title="https://example.com/docs/getting-started/installation"'
		);
	});
});
