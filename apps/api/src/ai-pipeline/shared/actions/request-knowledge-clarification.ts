import type { Database } from "@api/db";
import { getAiAgentById } from "@api/db/queries/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { KnowledgeClarificationContextSnapshot } from "@api/lib/knowledge-clarification-context";
import {
	emitConversationClarificationUpdate,
	startConversationKnowledgeClarification,
} from "@api/services/knowledge-clarification";

type RequestKnowledgeClarificationParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	topicSummary: string;
	contextSnapshot?: KnowledgeClarificationContextSnapshot | null;
};

export async function requestKnowledgeClarification(
	params: RequestKnowledgeClarificationParams
): Promise<{
	requestId: string;
	created: boolean;
	status: "awaiting_answer" | "draft_ready";
}> {
	const aiAgent = await getAiAgentById(params.db, {
		aiAgentId: params.aiAgentId,
	});
	if (!aiAgent) {
		throw new Error("AI agent not found");
	}

	try {
		const { created, step } = await startConversationKnowledgeClarification({
			db: params.db,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			aiAgent,
			conversation: params.conversation,
			topicSummary: params.topicSummary,
			actor: { aiAgentId: params.aiAgentId },
			contextSnapshot: params.contextSnapshot ?? null,
		});

		await emitConversationClarificationUpdate({
			db: params.db,
			conversation: params.conversation,
			request: step.request.status === "draft_ready" ? null : step.request,
			aiAgentId: params.aiAgentId,
		});

		return {
			requestId: step.request.id,
			created,
			status: step.kind === "draft_ready" ? "draft_ready" : "awaiting_answer",
		};
	} catch (error) {
		await emitConversationClarificationUpdate({
			db: params.db,
			conversation: params.conversation,
			request: null,
			aiAgentId: params.aiAgentId,
		});
		throw error;
	}
}
