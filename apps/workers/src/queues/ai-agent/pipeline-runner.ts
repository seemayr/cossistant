import { runAiAgentPipeline } from "@api/ai-pipeline";
import { updateConversationAiCursor } from "@api/db/mutations/conversation";
import type { Database } from "@workers/db";
import type { TriggerableWindowMessage } from "./message-window";

export class PipelineWindowError extends Error {
	failedMessage: TriggerableWindowMessage;

	constructor(message: string, failedMessage: TriggerableWindowMessage) {
		super(message);
		this.name = "PipelineWindowError";
		this.failedMessage = failedMessage;
	}
}

export async function runPipelineForWindow(params: {
	db: Database;
	conversation: {
		id: string;
		websiteId: string;
		organizationId: string;
		visitorId: string;
	};
	aiAgentId: string;
	jobId: string;
	messages: TriggerableWindowMessage[];
}): Promise<{ processedMessageCount: number }> {
	let processedMessageCount = 0;

	for (const message of params.messages) {
		let result: Awaited<ReturnType<typeof runAiAgentPipeline>>;
		try {
			result = await runAiAgentPipeline({
				db: params.db,
				input: {
					conversationId: params.conversation.id,
					messageId: message.id,
					messageCreatedAt: message.createdAt,
					websiteId: params.conversation.websiteId,
					organizationId: params.conversation.organizationId,
					visitorId: params.conversation.visitorId,
					aiAgentId: params.aiAgentId,
					workflowRunId: `ai-msg-${message.id}`,
					jobId: params.jobId,
				},
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Pipeline threw";
			throw new PipelineWindowError(errorMessage, message);
		}

		if (result.status === "error") {
			throw new PipelineWindowError(
				result.error ?? `Pipeline returned error for message ${message.id}`,
				message
			);
		}

		await updateConversationAiCursor(params.db, {
			conversationId: params.conversation.id,
			organizationId: params.conversation.organizationId,
			messageId: message.id,
			messageCreatedAt: message.createdAt,
		});
		processedMessageCount += 1;
	}

	return { processedMessageCount };
}
