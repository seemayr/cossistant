import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { logAiPipeline } from "../../logger";
import { emitPipelineSeen } from "../../shared/events";

export async function emitPipelineSeenSafe(params: {
	db: Database;
	conversation: ConversationSelect;
	aiAgentId: string;
	conversationId: string;
}): Promise<void> {
	try {
		await emitPipelineSeen({
			db: params.db,
			conversation: params.conversation,
			aiAgentId: params.aiAgentId,
		});
	} catch (error) {
		logAiPipeline({
			area: "primary",
			event: "seen_emit_failed",
			level: "warn",
			conversationId: params.conversationId,
			fields: {
				stage: "seen",
			},
			error,
		});
	}
}
