import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutate: () => null,
		mutateAsync: async () => null,
	}),
	useQueryClient: () => ({}),
}));

mock.module(
	"@/components/knowledge-clarification/use-query-invalidation",
	() => ({
		useKnowledgeClarificationQueryInvalidation: () => async () => {},
	})
);

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		knowledgeClarification: {
			defer: {
				mutationOptions: (options: unknown) => options,
			},
			dismiss: {
				mutationOptions: (options: unknown) => options,
			},
		},
	}),
}));

const clarificationPromptModulePromise = import("./clarification-teaser");

describe("ClarificationPrompt", () => {
	it("renders the current clarification teaser copy and actions", async () => {
		const { ClarificationPrompt } = await clarificationPromptModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(ClarificationPrompt, {
				websiteSlug: "acme",
				summary: {
					requestId: "req_1",
					status: "awaiting_answer",
					topicSummary: "Clarify billing timing",
					question: "Does the billing change immediately?",
					currentSuggestedAnswers: [
						"Immediately",
						"At the next billing cycle",
						"It depends on the plan",
					],
					currentQuestionInputMode: "suggested_answers",
					currentQuestionScope: "narrow_detail",
					stepIndex: 2,
					maxSteps: 5,
					progress: null,
					updatedAt: "2026-03-13T10:00:00.000Z",
				},
				conversationId: "conv_1",
				onClarify: () => {},
			})
		);

		expect(html).toContain("Clarification");
		expect(html).toContain("Clarify billing timing");
		expect(html).toContain(">Clarify<");
		expect(html).toContain(">Later<");
		expect(html).toContain("<title>x</title>");
	});
});
