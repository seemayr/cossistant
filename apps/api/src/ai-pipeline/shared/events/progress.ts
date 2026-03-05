import type { ConversationSelect } from "@api/db/schema/conversation";
import { realtime } from "@api/realtime/emitter";

export type PipelineToolProgressAudience = "all" | "dashboard";

type ToolProgressParams = {
	conversation: ConversationSelect;
	aiAgentId: string;
	workflowRunId: string;
	toolCallId: string;
	toolName: string;
	state: "partial" | "result" | "error";
	progressMessage?: string | null;
	audience?: PipelineToolProgressAudience;
};

function getDefaultToolMessage(toolName: string): string | null {
	const messages: Record<string, string> = {
		searchKnowledgeBase: "Searching knowledge base...",
		updateConversationTitle: "Updating conversation title...",
		updateSentiment: "Analyzing conversation...",
		setPriority: "Setting priority...",
	};

	return messages[toolName] ?? null;
}

export async function emitPipelineToolProgress(
	params: ToolProgressParams
): Promise<void> {
	const message =
		params.progressMessage ??
		(params.state === "partial"
			? getDefaultToolMessage(params.toolName)
			: null);

	await realtime.emit("aiAgentProcessingProgress", {
		websiteId: params.conversation.websiteId,
		organizationId: params.conversation.organizationId,
		visitorId: params.conversation.visitorId,
		userId: null,
		conversationId: params.conversation.id,
		aiAgentId: params.aiAgentId,
		workflowRunId: params.workflowRunId,
		phase: "tool",
		message,
		tool: {
			toolCallId: params.toolCallId,
			toolName: params.toolName,
			state: params.state,
		},
		audience: params.audience ?? "all",
	});
}

type GenerationPhaseParams = {
	conversation: ConversationSelect;
	aiAgentId: string;
	workflowRunId: string;
	phase: "thinking" | "generating" | "finalizing";
	message?: string | null;
	audience?: PipelineToolProgressAudience;
};

export async function emitPipelineGenerationProgress(
	params: GenerationPhaseParams
): Promise<void> {
	await realtime.emit("aiAgentProcessingProgress", {
		websiteId: params.conversation.websiteId,
		organizationId: params.conversation.organizationId,
		visitorId: params.conversation.visitorId,
		userId: null,
		conversationId: params.conversation.id,
		aiAgentId: params.aiAgentId,
		workflowRunId: params.workflowRunId,
		phase: params.phase,
		message: params.message ?? null,
		audience: params.audience ?? "dashboard",
	});
}
