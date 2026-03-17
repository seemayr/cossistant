import { describe, expect, it, mock } from "bun:test";
import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeClarificationProposalsSection } from "./proposals-section";

mock.module("next/navigation", () => ({
	useRouter: () => ({
		prefetch: () => {},
	}),
}));

mock.module("@tanstack/react-query", () => ({
	useQueryClient: () => ({
		getQueryState: () => null,
		prefetchQuery: () => Promise.resolve(),
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		knowledgeClarification: {
			getProposal: {
				queryOptions: (input: unknown) => ({
					queryKey: ["knowledgeClarification.getProposal", input],
				}),
			},
		},
		knowledge: {
			get: {
				queryOptions: (input: unknown) => ({
					queryKey: ["knowledge.get", input],
				}),
			},
		},
	}),
}));

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
		currentQuestionInputMode: "suggested_answers",
		currentQuestionScope: "narrow_detail",
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
				proposals={[]}
				websiteSlug="acme"
			/>
		);

		expect(html).toBe("");
	});

	it("renders ready-to-review proposals with clearer status and CTA", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationProposalsSection
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
				websiteSlug="acme"
			/>
		);

		expect(html).toContain("AI Suggestions (1)");
		expect(html).toContain(
			"Draft FAQs and clarification threads the AI wants you to review."
		);
		expect(html).toContain("Cossistant Logo");
		expect(html).toContain("AI Suggestion");
		expect(html).toContain("Ready for review");
		expect(html).toContain("Clarify how refunds work for annual plans");
		expect(html).not.toContain("From conversation");
		expect(html).not.toContain("Can annual plans get a refund?");
	});
});
