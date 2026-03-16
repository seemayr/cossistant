import type {
	ConversationClarificationSummary,
	KnowledgeClarificationRequest,
} from "@cossistant/types";

export type ConversationClarificationDisplayState = {
	engagedRequestId: string | null;
	showPrompt: boolean;
	showAction: boolean;
	actionRequest: KnowledgeClarificationRequest | null;
};

export function resolveEngagedConversationClarificationRequestId(params: {
	summary: ConversationClarificationSummary | null | undefined;
	engagedRequestId: string | null;
}): string | null {
	if (!params.summary) {
		return null;
	}

	if (!params.engagedRequestId) {
		return null;
	}

	return params.engagedRequestId === params.summary.requestId
		? params.engagedRequestId
		: null;
}

export function shouldShowConversationClarificationPrompt(params: {
	summary: ConversationClarificationSummary | null | undefined;
	engagedRequestId: string | null;
	hasEscalation: boolean;
	hasLimitAction: boolean;
}): boolean {
	if (params.hasLimitAction) {
		return false;
	}

	if (!params.summary?.question) {
		return false;
	}

	if (params.hasEscalation) {
		return true;
	}

	return params.engagedRequestId !== params.summary.requestId;
}

export function shouldShowConversationClarificationAction(params: {
	summary: ConversationClarificationSummary | null | undefined;
	engagedRequestId: string | null;
}): boolean {
	if (!(params.summary && params.engagedRequestId)) {
		return false;
	}

	return params.summary.requestId === params.engagedRequestId;
}

export function resolveConversationClarificationDisplayState(params: {
	summary: ConversationClarificationSummary | null | undefined;
	request: KnowledgeClarificationRequest | null | undefined;
	engagedRequestId: string | null;
	hasEscalation: boolean;
	hasLimitAction: boolean;
}): ConversationClarificationDisplayState {
	const engagedRequestId = resolveEngagedConversationClarificationRequestId({
		summary: params.summary,
		engagedRequestId: params.engagedRequestId,
	});
	const showAction =
		!(params.hasEscalation || params.hasLimitAction) &&
		shouldShowConversationClarificationAction({
			summary: params.summary,
			engagedRequestId,
		});
	const showPrompt = shouldShowConversationClarificationPrompt({
		summary: params.summary,
		engagedRequestId,
		hasEscalation: params.hasEscalation,
		hasLimitAction: params.hasLimitAction,
	});

	return {
		engagedRequestId,
		showPrompt,
		showAction,
		actionRequest: showAction ? (params.request ?? null) : null,
	};
}
