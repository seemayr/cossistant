import { describe, expect, it } from "bun:test";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchKnowledgeTimelineTool } from "./timeline-search-knowledge-tool";

function createToolTimelineItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id: "tool-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "tool",
		text: "Searching knowledge base...",
		parts: [
			{
				type: "tool-searchKnowledgeBase",
				toolCallId: "call-1",
				toolName: "searchKnowledgeBase",
				input: { query: "pricing" },
				state: "partial",
			},
		],
		userId: null,
		visitorId: null,
		aiAgentId: "ai-1",
		createdAt: "2026-03-08T10:00:00.000Z",
		deletedAt: null,
		tool: "searchKnowledgeBase",
		...overrides,
	};
}

describe("SearchKnowledgeTimelineTool", () => {
	it("renders the partial state with the knowledge search label", () => {
		const html = renderToStaticMarkup(
			<SearchKnowledgeTimelineTool
				conversationId="conv-1"
				item={createToolTimelineItem()}
			/>
		);

		expect(html).toContain("Searching for &quot;pricing&quot;...");
		expect(html).toContain('data-tool-display-state="partial"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="spinner"');
		expect(html).toContain('data-co-spinner="true"');
		expect(html).not.toContain("rounded-lg");
	});

	it("renders result state with the executed query and source labels", () => {
		const html = renderToStaticMarkup(
			<SearchKnowledgeTimelineTool
				conversationId="conv-1"
				item={createToolTimelineItem({
					text: "Found 2 sources",
					parts: [
						{
							type: "tool-searchKnowledgeBase",
							toolCallId: "call-1",
							toolName: "searchKnowledgeBase",
							input: { query: "pricing" },
							state: "result",
							output: {
								success: true,
								data: {
									totalFound: 2,
									articles: [
										{
											title: "Billing FAQ",
											sourceUrl: "https://example.com/billing",
										},
										{
											sourceUrl: "https://docs.example.com/pricing",
										},
									],
								},
							},
						},
					],
				})}
			/>
		);

		expect(html).toContain("Searched for &quot;pricing&quot;");
		expect(html).toContain("Billing FAQ");
		expect(html).toContain("docs.example.com/pricing");
		expect(html).toContain('data-tool-display-state="result"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).toContain("-&gt;");
		expect(html).not.toContain("rounded-full");
	});

	it("replaces zero-source summaries with the executed query", () => {
		const html = renderToStaticMarkup(
			<SearchKnowledgeTimelineTool
				conversationId="conv-1"
				item={createToolTimelineItem({
					text: "Found 0 sources",
					parts: [
						{
							type: "tool-searchKnowledgeBase",
							toolCallId: "call-1",
							toolName: "searchKnowledgeBase",
							input: { query: "refund policy" },
							state: "result",
							output: {
								success: true,
								data: {
									totalFound: 0,
									articles: [],
								},
							},
						},
					],
				})}
			/>
		);

		expect(html).toContain("Searched for &quot;refund policy&quot;");
		expect(html).not.toContain("Found 0 sources");
	});

	it("suppresses the terminal arrow when the caller marks it as a single tool row", () => {
		const html = renderToStaticMarkup(
			<SearchKnowledgeTimelineTool
				conversationId="conv-1"
				item={createToolTimelineItem({
					text: "Found 2 sources",
					parts: [
						{
							type: "tool-searchKnowledgeBase",
							toolCallId: "call-1",
							toolName: "searchKnowledgeBase",
							input: { query: "pricing" },
							state: "result",
							output: {
								success: true,
								data: {
									totalFound: 2,
									articles: [],
								},
							},
						},
					],
				})}
				showTerminalIndicator={false}
			/>
		);

		expect(html).toContain("Searched for &quot;pricing&quot;");
		expect(html).not.toContain('data-tool-execution-indicator="arrow"');
		expect(html).not.toContain('data-tool-execution-indicator-slot="true"');
	});
});
