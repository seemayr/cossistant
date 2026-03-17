import { describe, expect, it } from "bun:test";
import type {
	ConversationClarificationSummary,
	KnowledgeClarificationRequest,
} from "@cossistant/types";
import {
	resolveConversationClarificationDisplayState,
	resolveEngagedConversationClarificationRequestId,
} from "./conversation-state";

function createSummary(
	overrides: Partial<ConversationClarificationSummary> = {}
): ConversationClarificationSummary {
	return {
		requestId: "req_1",
		status: "awaiting_answer",
		topicSummary: "Clarify billing timing",
		question: "Does the billing change immediately?",
		stepIndex: 2,
		maxSteps: 5,
		updatedAt: "2026-03-13T10:00:00.000Z",
		...overrides,
	};
}

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
		stepIndex: 2,
		maxSteps: 5,
		targetKnowledgeId: null,
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
		createdAt: "2026-03-13T10:00:00.000Z",
		updatedAt: "2026-03-13T10:00:00.000Z",
		...overrides,
	};
}

describe("resolveEngagedConversationClarificationRequestId", () => {
	it("clears the engaged request when the active request disappears or changes", () => {
		expect(
			resolveEngagedConversationClarificationRequestId({
				summary: null,
				engagedRequestId: "req_1",
			})
		).toBeNull();

		expect(
			resolveEngagedConversationClarificationRequestId({
				summary: createSummary({ requestId: "req_2" }),
				engagedRequestId: "req_1",
			})
		).toBeNull();
	});

	it("keeps the engaged request when it still matches the active clarification", () => {
		expect(
			resolveEngagedConversationClarificationRequestId({
				summary: createSummary(),
				engagedRequestId: "req_1",
			})
		).toBe("req_1");
	});

	it("clears the engaged request once the clarification becomes a draft banner", () => {
		expect(
			resolveEngagedConversationClarificationRequestId({
				summary: createSummary({
					status: "draft_ready",
					question: null,
				}),
				engagedRequestId: "req_1",
			})
		).toBeNull();
	});
});

describe("resolveConversationClarificationDisplayState", () => {
	it("shows the inline prompt for an unanswered clarification before the flow is engaged", () => {
		expect(
			resolveConversationClarificationDisplayState({
				summary: createSummary(),
				request: createRequest(),
				engagedRequestId: null,
				hasEscalation: false,
				hasLimitAction: false,
			})
		).toMatchObject({
			engagedRequestId: null,
			showPrompt: true,
			showAction: false,
			actionRequest: null,
		});
	});

	it("switches to the full clarification flow once the request is engaged", () => {
		const request = createRequest();

		expect(
			resolveConversationClarificationDisplayState({
				summary: createSummary(),
				request,
				engagedRequestId: "req_1",
				hasEscalation: false,
				hasLimitAction: false,
			})
		).toMatchObject({
			engagedRequestId: "req_1",
			showPrompt: false,
			showAction: true,
			actionRequest: request,
		});
	});

	it("keeps the prompt visible during escalation while leaving the inline action hidden", () => {
		expect(
			resolveConversationClarificationDisplayState({
				summary: createSummary(),
				request: createRequest(),
				engagedRequestId: null,
				hasEscalation: true,
				hasLimitAction: false,
			})
		).toMatchObject({
			showPrompt: true,
			showAction: false,
		});
	});

	it("hides clarification UI while hard-limit states take precedence", () => {
		expect(
			resolveConversationClarificationDisplayState({
				summary: createSummary(),
				request: createRequest(),
				engagedRequestId: "req_1",
				hasEscalation: false,
				hasLimitAction: true,
			})
		).toMatchObject({
			showPrompt: false,
			showAction: false,
			actionRequest: null,
		});
	});

	it("keeps the prompt visible even when the cached request payload is out of date", () => {
		expect(
			resolveConversationClarificationDisplayState({
				summary: createSummary({ requestId: "req_2" }),
				request: createRequest({ id: "req_1" }),
				engagedRequestId: null,
				hasEscalation: false,
				hasLimitAction: false,
			})
		).toMatchObject({
			showPrompt: true,
			actionRequest: null,
		});
	});

	it("keeps the engaged action visible while waiting for the active request payload", () => {
		expect(
			resolveConversationClarificationDisplayState({
				summary: createSummary(),
				request: null,
				engagedRequestId: "req_1",
				hasEscalation: false,
				hasLimitAction: false,
			})
		).toMatchObject({
			showPrompt: false,
			showAction: true,
			actionRequest: null,
		});
	});

	it("switches draft-ready clarifications into the composer banner state", () => {
		const request = createRequest({
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
		});

		expect(
			resolveConversationClarificationDisplayState({
				summary: createSummary({
					status: "draft_ready",
					question: null,
				}),
				request,
				engagedRequestId: "req_1",
				hasEscalation: false,
				hasLimitAction: false,
			})
		).toMatchObject({
			engagedRequestId: null,
			showPrompt: false,
			showAction: false,
			showDraftBanner: true,
			bannerRequest: request,
		});
	});
});
