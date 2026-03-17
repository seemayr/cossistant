"use client";

import type {
	KnowledgeClarificationRequest,
	KnowledgeClarificationStepResponse,
} from "@cossistant/types";

export function stepFromKnowledgeClarificationRequest(
	request: KnowledgeClarificationRequest | null | undefined
): KnowledgeClarificationStepResponse | null {
	if (!request) {
		return null;
	}

	if (request.draftFaqPayload) {
		return {
			kind: "draft_ready",
			request,
			draftFaqPayload: request.draftFaqPayload,
		};
	}

	if (request.currentQuestion && request.currentSuggestedAnswers) {
		return {
			kind: "question",
			request,
			question: request.currentQuestion,
			suggestedAnswers: request.currentSuggestedAnswers,
			inputMode: request.currentQuestionInputMode ?? "suggested_answers",
			questionScope: request.currentQuestionScope ?? "narrow_detail",
		};
	}

	return null;
}
