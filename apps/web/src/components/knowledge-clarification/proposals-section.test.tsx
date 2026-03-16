import { describe, expect, it } from "bun:test";
import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeClarificationProposalsSection } from "./proposals-section";

function createProposal(
	overrides: Partial<KnowledgeClarificationRequest> = {}
): KnowledgeClarificationRequest {
	return {
		id: "01JQJ2V0A00000000000000000",
		organizationId: "01JQJ2V0A00000000000000001",
		websiteId: "01JQJ2V0A00000000000000002",
		aiAgentId: "01JQJ2V0A00000000000000003",
		conversationId: null,
		source: "faq",
		status: "deferred",
		topicSummary: "Clarify how refunds work for annual plans",
		stepIndex: 1,
		maxSteps: 3,
		targetKnowledgeId: null,
		currentQuestion: "Do annual plans get a prorated refund?",
		currentSuggestedAnswers: ["Yes", "No", "Only within 30 days"],
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-16T00:00:00.000Z",
		updatedAt: "2026-03-16T00:00:00.000Z",
		...overrides,
	};
}

describe("KnowledgeClarificationProposalsSection", () => {
	it("renders nothing when there are no proposals", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationProposalsSection
				onOpenProposal={() => {}}
				proposals={[]}
			/>
		);

		expect(html).toBe("");
	});

	it("renders ready-to-review proposals with clearer status and CTA", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationProposalsSection
				onOpenProposal={() => {}}
				proposals={[
					createProposal({
						source: "conversation",
						status: "draft_ready",
						draftFaqPayload: {
							title: "Refund eligibility",
							question: "Can annual plans get a refund?",
							answer: "Annual plans can be refunded within the first 30 days.",
							categories: ["Billing"],
							relatedQuestions: ["What happens after 30 days?"],
						},
					}),
				]}
			/>
		);

		expect(html).toContain("FAQ drafts and follow-up questions");
		expect(html).toContain(
			"These are saved questions and draft FAQs the AI wants you to review."
		);
		expect(html).toContain("Draft FAQ");
		expect(html).toContain("From conversation");
		expect(html).toContain("Review draft");
		expect(html).toContain("Can annual plans get a refund?");
	});
});
