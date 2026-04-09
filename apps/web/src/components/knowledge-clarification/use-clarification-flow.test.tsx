import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { KnowledgeClarificationRequest } from "@cossistant/types";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let streamObject: Record<string, unknown> | null = null;
let streamIsLoading = false;

const submitActionMock = mock(() => null);
const approveMutateMock = mock(() => null);
const deferMutateMock = mock(() => null);
const dismissMutateMock = mock(() => null);
const invalidateQueriesMock = mock(async () => {});

const deferMutationOptionsMock = mock((options: Record<string, unknown>) => ({
	...options,
	__kind: "defer",
}));
const dismissMutationOptionsMock = mock((options: Record<string, unknown>) => ({
	...options,
	__kind: "dismiss",
}));
const approveDraftMutationOptionsMock = mock(
	(options: Record<string, unknown>) => ({ ...options, __kind: "approve" })
);

mock.module("@tanstack/react-query", () => ({
	useMutation: (options: Record<string, unknown> & { __kind?: string }) => ({
		isError: false,
		isPending: false,
		mutate:
			options.__kind === "approve"
				? approveMutateMock
				: options.__kind === "defer"
					? deferMutateMock
					: dismissMutateMock,
		mutateAsync: async () => null,
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		knowledgeClarification: {
			defer: {
				mutationOptions: deferMutationOptionsMock,
			},
			dismiss: {
				mutationOptions: dismissMutationOptionsMock,
			},
			approveDraft: {
				mutationOptions: approveDraftMutationOptionsMock,
			},
		},
	}),
}));

mock.module("./use-query-invalidation", () => ({
	useKnowledgeClarificationQueryInvalidation: () => invalidateQueriesMock,
}));

mock.module("./use-clarification-stream", () => ({
	useKnowledgeClarificationStreamAction: () => ({
		object: streamObject,
		isLoading: streamIsLoading,
		isPendingAction: () => false,
		submitAction: submitActionMock,
	}),
}));

const modulePromise = import("./use-clarification-flow");

function createRequest(
	overrides: Partial<KnowledgeClarificationRequest> = {}
): KnowledgeClarificationRequest {
	return {
		id: "req_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		conversationId: "conv_1",
		source: "conversation",
		status: "awaiting_answer",
		topicSummary: "Clarify billing timing",
		engagementMode: "owner",
		linkedConversationCount: 1,
		stepIndex: 1,
		maxSteps: 3,
		targetKnowledgeId: null,
		targetKnowledgeSummary: null,
		questionPlan: null,
		currentQuestion: "Does the billing change immediately?",
		currentSuggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		],
		currentQuestionInputMode: "suggested_answers",
		currentQuestionScope: "narrow_detail",
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-17T10:00:00.000Z",
		updatedAt: "2026-03-17T10:00:00.000Z",
		...overrides,
	};
}

async function renderHook(
	initialRequest: KnowledgeClarificationRequest | null
) {
	const { useKnowledgeClarificationFlow } = await modulePromise;
	let hookValue: ReturnType<typeof useKnowledgeClarificationFlow> | null = null;

	function Harness() {
		hookValue = useKnowledgeClarificationFlow({
			initialRequest,
			websiteSlug: "acme",
		});
		return null;
	}

	renderToStaticMarkup(<Harness />);

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return hookValue;
}

describe("useKnowledgeClarificationFlow", () => {
	beforeEach(() => {
		streamObject = null;
		streamIsLoading = false;
		submitActionMock.mockClear();
		approveMutateMock.mockClear();
		deferMutateMock.mockClear();
		dismissMutateMock.mockClear();
		invalidateQueriesMock.mockClear();
		deferMutationOptionsMock.mockClear();
		dismissMutationOptionsMock.mockClear();
		approveDraftMutationOptionsMock.mockClear();
	});

	it("derives the active review step and editable draft state from a draft-ready request", async () => {
		const hookValue = await renderHook(
			createRequest({
				status: "draft_ready",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does billing change take effect?",
					answer: "It applies at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		expect(hookValue.currentStep?.kind).toBe("draft_ready");
		expect(hookValue.activeReviewStep?.request.id).toBe("req_1");
		expect(hookValue.reviewDraftPayload?.question).toBe(
			"When does billing change take effect?"
		);
		expect(hookValue.reviewDraftState.parsedDraft.answer).toBe(
			"It applies at the next billing cycle."
		);
	});

	it("prefers a streamed draft-ready preview over the stale request state", async () => {
		streamObject = {
			requestId: "req_1",
			status: "draft_ready",
			updatedAt: "2026-03-17T10:05:00.000Z",
			decision: {
				kind: "draft_ready",
				topicSummary: "Clarify billing timing",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does billing change take effect?",
					answer: "It applies at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
		};

		const hookValue = await renderHook(createRequest());

		expect(hookValue.currentStep?.kind).toBe("draft_ready");
		expect(hookValue.reviewDraftPayload?.question).toBe(
			"When does billing change take effect?"
		);
	});

	it("approves the parsed active review draft through the shared controller", async () => {
		const hookValue = await renderHook(
			createRequest({
				status: "draft_ready",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does billing change take effect?",
					answer: "It applies at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		hookValue.approveActiveDraft();

		expect(approveMutateMock).toHaveBeenCalledWith({
			websiteSlug: "acme",
			requestId: "req_1",
			draft: hookValue.reviewDraftState.parsedDraft,
		});
	});
});
