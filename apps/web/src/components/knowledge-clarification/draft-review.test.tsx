import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeClarificationDraftPreviewCard } from "./draft-review";

const draft = {
	title: "Delete your account",
	question: "How do I delete my account?",
	answer:
		"Go to Settings -> Account -> Delete my account. We send a confirmation email, and the account stays recoverable for 30 days.",
	categories: ["Account"],
	relatedQuestions: ["Can I recover my account after deleting it?"],
};

describe("KnowledgeClarificationDraftPreviewCard", () => {
	it("renders the default preview card with metadata", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationDraftPreviewCard draft={draft} />
		);

		expect(html).toContain(
			'data-knowledge-clarification-draft-preview-variant="default"'
		);
		expect(html).toContain("Knowledge base updated");
		expect(html).toContain("Categories");
	});

	it("renders a minimalist landing variant with only the faq content", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationDraftPreviewCard draft={draft} variant="minimal" />
		);

		expect(html).toContain(
			'data-knowledge-clarification-draft-preview-variant="minimal"'
		);
		expect(html).toContain("How do I delete my account?");
		expect(html).toContain("recoverable for 30 days");
		expect(html).not.toContain("Knowledge base updated");
		expect(html).not.toContain("Categories");
	});

	it("renders square dashed pills in the minimal variant when provided", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationDraftPreviewCard
				draft={draft}
				minimalPills={["generated", "AI"]}
				variant="minimal"
			/>
		);

		expect(html).toContain(
			'data-knowledge-clarification-draft-preview-pills="true"'
		);
		expect(html).toContain(
			'data-knowledge-clarification-draft-preview-pill="generated"'
		);
		expect(html).toContain(
			'data-knowledge-clarification-draft-preview-pill="AI"'
		);
	});
});
