import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutateAsync: async () => null,
	}),
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
			answer: {
				mutationOptions: (options: unknown) => options,
			},
			skip: {
				mutationOptions: (options: unknown) => options,
			},
		},
	}),
}));

const modulePromise = import("./clarification-composer-flow");

function createSummary(
	overrides: Partial<{
		requestId: string;
		status: "analyzing" | "awaiting_answer";
		topicSummary: string;
		question: string | null;
		stepIndex: number;
		maxSteps: number;
		updatedAt: string;
	}> = {}
) {
	return {
		requestId: "req_1",
		status: "awaiting_answer" as const,
		topicSummary: "Clarify billing timing",
		question: "Does the billing change immediately?",
		stepIndex: 2,
		maxSteps: 5,
		updatedAt: "2026-03-14T10:00:00.000Z",
		...overrides,
	};
}

function createRequest(
	overrides: Partial<{
		id: string;
		organizationId: string;
		websiteId: string;
		aiAgentId: string;
		conversationId: string | null;
		source: "conversation" | "faq";
		status:
			| "analyzing"
			| "awaiting_answer"
			| "draft_ready"
			| "deferred"
			| "applied"
			| "dismissed";
		topicSummary: string;
		stepIndex: number;
		maxSteps: number;
		targetKnowledgeId: string | null;
		currentQuestion: string | null;
		currentSuggestedAnswers: [string, string, string] | null;
		draftFaqPayload: {
			title: string | null;
			question: string;
			answer: string;
			categories: string[];
			relatedQuestions: string[];
		} | null;
		lastError: string | null;
		createdAt: string;
		updatedAt: string;
	}> = {}
) {
	return {
		id: "req_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		conversationId: "conv_1",
		source: "conversation" as const,
		status: "awaiting_answer" as const,
		topicSummary: "Clarify billing timing",
		stepIndex: 2,
		maxSteps: 5,
		targetKnowledgeId: null,
		currentQuestion: "Does the billing change immediately?",
		currentSuggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		] as [string, string, string],
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-14T09:00:00.000Z",
		updatedAt: "2026-03-14T10:00:00.000Z",
		...overrides,
	};
}

describe("useClarificationComposerFlow", () => {
	it("renders topic, question flow, and bottom actions for an engaged clarification", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest(),
				summary: createSummary(),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain('data-clarification-slot="topic"');
		expect(html).toContain("Clarify billing timing");
		expect(html).toContain('data-clarification-slot="question-flow"');
		expect(html).toContain("Does the billing change immediately?");
		expect(html).toContain('data-clarification-slot="actions"');
		expect(html).toContain(">Skip<");
		expect(html).toContain(">Next<");
		expect(html).toContain(">Cancel<");
	});

	it("renders a loading state while the engaged clarification request is still loading", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: null,
				summary: createSummary({ status: "analyzing", question: null }),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain("Clarify billing timing");
		expect(html).toContain('data-clarification-slot="loading"');
		expect(html).toContain("Preparing the next clarification step...");
		expect(html).toContain(">Cancel<");
	});

	it("returns no inline blocks once the clarification reaches the draft stage", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest({
					status: "draft_ready",
					currentQuestion: null,
					currentSuggestedAnswers: null,
					draftFaqPayload: {
						title: "Billing timing",
						question: "When does billing change take effect?",
						answer: "It applies at the next billing cycle.",
						categories: ["Billing"],
						relatedQuestions: [],
					},
				}),
				summary: createSummary(),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toBe("");
	});
});
