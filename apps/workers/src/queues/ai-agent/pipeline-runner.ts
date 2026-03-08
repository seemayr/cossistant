import { runPrimaryPipeline } from "@api/ai-pipeline";
import { updateConversationAiCursor } from "@api/db/mutations/conversation";
import type { Database } from "@workers/db";
import type { TriggerableMessage } from "./next-triggerable-message";

export class PipelineMessageError extends Error {
	failedMessage: TriggerableMessage;

	constructor(message: string, failedMessage: TriggerableMessage) {
		super(message);
		this.name = "PipelineMessageError";
		this.failedMessage = failedMessage;
	}
}

export async function runPipelineForMessage(params: {
	db: Database;
	conversation: {
		id: string;
		websiteId: string;
		organizationId: string;
		visitorId: string;
	};
	aiAgentId: string;
	jobId: string;
	message: TriggerableMessage;
}): Promise<{
	processedMessageId: string;
	processedMessageCreatedAt: string;
}> {
	let result: Awaited<ReturnType<typeof runPrimaryPipeline>>;
	try {
		result = await runPrimaryPipeline({
			db: params.db,
			input: {
				conversationId: params.conversation.id,
				messageId: params.message.id,
				messageCreatedAt: params.message.createdAt,
				websiteId: params.conversation.websiteId,
				organizationId: params.conversation.organizationId,
				visitorId: params.conversation.visitorId,
				aiAgentId: params.aiAgentId,
				workflowRunId: `ai-msg-${params.message.id}`,
				jobId: params.jobId,
			},
		});
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Pipeline threw";
		throw new PipelineMessageError(errorMessage, params.message);
	}

	if (result.cursorDisposition === "retry") {
		throw new PipelineMessageError(
			result.error ??
				result.reason ??
				`Pipeline requested retry for message ${params.message.id}`,
			params.message
		);
	}

	await updateConversationAiCursor(params.db, {
		conversationId: params.conversation.id,
		organizationId: params.conversation.organizationId,
		messageId: params.message.id,
		messageCreatedAt: params.message.createdAt,
	});

	return {
		processedMessageId: params.message.id,
		processedMessageCreatedAt: params.message.createdAt,
	};
}
