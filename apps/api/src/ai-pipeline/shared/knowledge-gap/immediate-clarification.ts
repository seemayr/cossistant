import { getActiveKnowledgeClarificationForConversation } from "@api/db/queries/knowledge-clarification";
import {
	buildConversationClarificationContextSnapshot,
	buildSpecificClarificationTopicSummary,
	getKnowledgeClarificationSearchEvidenceFromToolExecutions,
} from "@api/lib/knowledge-clarification-context";
import type { IntakeReadyContext } from "../../primary-pipeline/steps/intake/types";
import { requestKnowledgeClarification as requestKnowledgeClarificationAction } from "../actions/request-knowledge-clarification";
import type { GenerationRuntimeResult } from "../generation/contracts";
import { getBehaviorSettings } from "../settings";
import {
	getBestSearchSignal,
	getSearchKnowledgeSignalsFromToolExecutions,
} from "./search-signals";

export async function maybeCreateImmediateClarificationFromSearchGap(params: {
	db: import("@api/db").Database;
	intake: IntakeReadyContext;
	generationResult: GenerationRuntimeResult;
}): Promise<
	| {
			status: "created";
			requestId: string;
			created: boolean;
			topicSummary: string;
	  }
	| {
			status: "skipped";
			reason:
				| "capability_disabled"
				| "active_clarification_exists"
				| "already_requested"
				| "no_search"
				| "search_not_obvious_gap";
	  }
> {
	const settings = getBehaviorSettings(params.intake.aiAgent);
	if (!settings.canRequestKnowledgeClarification) {
		return {
			status: "skipped",
			reason: "capability_disabled",
		};
	}

	if (
		(params.generationResult.toolCallsByName.requestKnowledgeClarification ??
			0) > 0
	) {
		return {
			status: "skipped",
			reason: "already_requested",
		};
	}

	const existingClarification =
		await getActiveKnowledgeClarificationForConversation(params.db, {
			conversationId: params.intake.conversation.id,
			websiteId: params.intake.conversation.websiteId,
		});
	if (existingClarification) {
		return {
			status: "skipped",
			reason: "active_clarification_exists",
		};
	}

	const searchSignals = getSearchKnowledgeSignalsFromToolExecutions(
		params.generationResult.toolExecutions ?? []
	);
	if (searchSignals.length === 0) {
		return {
			status: "skipped",
			reason: "no_search",
		};
	}

	const bestSearchSignal = getBestSearchSignal(searchSignals);
	if (!(bestSearchSignal && bestSearchSignal.retrievalQuality === "none")) {
		return {
			status: "skipped",
			reason: "search_not_obvious_gap",
		};
	}

	const contextSnapshot = buildConversationClarificationContextSnapshot({
		conversationHistory: params.intake.conversationHistory,
		triggerMessage: params.intake.triggerMessage,
		searchEvidence: getKnowledgeClarificationSearchEvidenceFromToolExecutions(
			params.generationResult.toolExecutions ?? []
		),
	});
	const topicSummary = buildSpecificClarificationTopicSummary({
		triggerText: params.intake.triggerMessageText,
		searchEvidence: contextSnapshot.kbSearchEvidence,
		fallback: params.intake.triggerMessageText,
	});
	const clarificationResult = await requestKnowledgeClarificationAction({
		db: params.db,
		conversation: params.intake.conversation,
		organizationId: params.intake.conversation.organizationId,
		websiteId: params.intake.conversation.websiteId,
		aiAgentId: params.intake.aiAgent.id,
		topicSummary,
		contextSnapshot,
	});

	return {
		status: "created",
		requestId: clarificationResult.requestId,
		created: clarificationResult.created,
		topicSummary,
	};
}
