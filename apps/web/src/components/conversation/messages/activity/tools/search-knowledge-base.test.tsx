import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchKnowledgeBaseActivity } from "./search-knowledge-base";

describe("SearchKnowledgeBaseActivity", () => {
	it("renders loading copy for a partial search", () => {
		const html = renderToStaticMarkup(
			<SearchKnowledgeBaseActivity
				timestamp="09:01"
				toolCall={{
					toolCallId: "tool-1",
					toolName: "searchKnowledgeBase",
					input: { query: "delete account" },
					state: "partial",
					summaryText: "",
					logType: "customer_facing",
					isFallback: false,
				}}
			/>
		);

		expect(html).toContain("Searching for &quot;delete account&quot;...");
	});

	it("renders an explicit no-results result when the search finds nothing", () => {
		const html = renderToStaticMarkup(
			<SearchKnowledgeBaseActivity
				timestamp="09:01"
				toolCall={{
					toolCallId: "tool-1",
					toolName: "searchKnowledgeBase",
					input: { query: "delete account" },
					state: "result",
					output: {
						data: {
							totalFound: 0,
							articles: [],
						},
					},
					summaryText: "",
					logType: "customer_facing",
					isFallback: false,
				}}
			/>
		);

		expect(html).toContain(
			"No saved answer for &quot;delete account&quot; yet"
		);
		expect(html).not.toContain("Searched for &quot;delete account&quot;");
		expect(html).not.toContain('data-source-pill="true"');
	});
});
