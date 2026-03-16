import { describe, expect, it } from "bun:test";
import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { stepFromKnowledgeClarificationRequest } from "./helpers";

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
		stepIndex: 1,
		maxSteps: 3,
		targetKnowledgeId: null,
		currentQuestion: "When does the billing change take effect?",
		currentSuggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		],
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-16T09:00:00.000Z",
		updatedAt: "2026-03-16T09:00:00.000Z",
		...overrides,
	};
}

describe("stepFromKnowledgeClarificationRequest", () => {
	it("reconstructs a deferred pending question as a question step", () => {
		const step = stepFromKnowledgeClarificationRequest(
			createRequest({
				status: "deferred",
			})
		);

		expect(step).toEqual({
			kind: "question",
			request: createRequest({
				status: "deferred",
			}),
			question: "When does the billing change take effect?",
			suggestedAnswers: [
				"Immediately",
				"At the next billing cycle",
				"It depends on the plan",
			],
		});
	});
});
