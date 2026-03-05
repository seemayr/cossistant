import { tool } from "ai";
import { z } from "zod";
import { addInternalNote } from "../actions/internal-note";
import { sendMessage as sendPublicMessage } from "../actions/send-message";
import type {
	PipelineToolContext,
	PipelineToolResult,
	PublicMessageToolName,
	ToolTelemetrySpec,
} from "./contracts";

const publicMessageInputSchema = z.object({
	message: z
		.string()
		.min(1)
		.describe("Public visitor-facing message. Keep it concise and clear."),
});

const sendPrivateMessageInputSchema = z.object({
	message: z
		.string()
		.min(1)
		.describe("Private internal note for teammates only."),
});

const PUBLIC_MESSAGE_TOOL_ORDER = [
	"sendAcknowledgeMessage",
	"sendMessage",
	"sendFollowUpMessage",
] as const satisfies readonly PublicMessageToolName[];

function getAllowedNextPublicTools(
	sequence: PublicMessageToolName[]
): PublicMessageToolName[] {
	if (sequence.length === 0) {
		return ["sendAcknowledgeMessage", "sendMessage"];
	}

	if (sequence.length === 1) {
		if (sequence[0] === "sendAcknowledgeMessage") {
			return ["sendMessage"];
		}
		if (sequence[0] === "sendMessage") {
			return ["sendFollowUpMessage"];
		}
		return [];
	}

	if (
		sequence.length === 2 &&
		sequence[0] === "sendAcknowledgeMessage" &&
		sequence[1] === "sendMessage"
	) {
		return ["sendFollowUpMessage"];
	}

	return [];
}

function validateAndTrackPublicMessageToolCall(params: {
	ctx: PipelineToolContext;
	toolName: PublicMessageToolName;
}): PipelineToolResult<null> | null {
	const { ctx, toolName } = params;
	const currentCount = ctx.runtimeState.publicMessageToolCounts[toolName] ?? 0;
	if (currentCount >= 1) {
		return {
			success: false,
			error: `${toolName} can only be called once per run`,
		};
	}

	const allowedNextTools = getAllowedNextPublicTools(
		ctx.runtimeState.publicMessageToolSequence
	);
	if (!allowedNextTools.includes(toolName)) {
		return {
			success: false,
			error: `Invalid public-message sequence. Allowed next tool(s): ${
				allowedNextTools.length > 0 ? allowedNextTools.join(", ") : "none"
			}`,
		};
	}

	ctx.runtimeState.publicMessageToolCounts[toolName] = currentCount + 1;
	ctx.runtimeState.publicMessageToolSequence.push(toolName);
	return null;
}

async function invokeTypingCallback(
	callback: (() => Promise<void>) | undefined,
	params: {
		conversationId: string;
		callbackName: "startTyping" | "stopTyping";
	}
): Promise<void> {
	if (!callback) {
		return;
	}

	try {
		await callback();
	} catch (error) {
		console.warn(
			`[ai-pipeline:tool:messaging] conv=${params.conversationId} | ${params.callbackName} callback failed`,
			error
		);
	}
}

async function executePublicMessageSend(params: {
	ctx: PipelineToolContext;
	toolName: PublicMessageToolName;
	message: string;
}): Promise<PipelineToolResult<{ messageId: string; created: boolean }>> {
	const { ctx, toolName, message } = params;
	if (!ctx.allowPublicMessages) {
		return {
			success: false,
			error: "Public messages are disabled for this generation mode",
		};
	}

	const sequenceError = validateAndTrackPublicMessageToolCall({
		ctx,
		toolName,
	});
	if (sequenceError) {
		return {
			success: false,
			error: sequenceError.error,
		};
	}

	const trimmedMessage = message.trim();
	if (!trimmedMessage) {
		return {
			success: false,
			error: "Message is empty",
		};
	}

	ctx.runtimeState.publicSendSequence += 1;
	const slot = ctx.runtimeState.publicSendSequence;
	const createdAt = new Date(Math.max(Date.now(), Date.now() + slot));

	await invokeTypingCallback(ctx.stopTyping, {
		conversationId: ctx.conversationId,
		callbackName: "stopTyping",
	});

	const result = await sendPublicMessage({
		db: ctx.db,
		conversationId: ctx.conversationId,
		organizationId: ctx.organizationId,
		websiteId: ctx.websiteId,
		visitorId: ctx.visitorId,
		aiAgentId: ctx.aiAgentId,
		text: trimmedMessage,
		idempotencyKey: `public:${ctx.triggerMessageId}:${toolName}:slot:${slot}`,
		createdAt,
	});

	if (result.paused) {
		return {
			success: false,
			error: "AI is paused for this conversation",
		};
	}

	if (
		result.messageId &&
		!ctx.runtimeState.sentPublicMessageIds.has(result.messageId)
	) {
		ctx.runtimeState.sentPublicMessageIds.add(result.messageId);
		ctx.runtimeState.publicMessagesSent += 1;
	}

	await invokeTypingCallback(ctx.startTyping, {
		conversationId: ctx.conversationId,
		callbackName: "startTyping",
	});

	return {
		success: true,
		data: {
			messageId: result.messageId,
			created: result.created,
		},
	};
}

function createPublicMessageTool(params: {
	ctx: PipelineToolContext;
	toolName: PublicMessageToolName;
	description: string;
}) {
	return tool({
		description: params.description,
		inputSchema: publicMessageInputSchema,
		execute: ({ message }) =>
			executePublicMessageSend({
				ctx: params.ctx,
				toolName: params.toolName,
				message,
			}),
	});
}

export function createSendAcknowledgeMessageTool(ctx: PipelineToolContext) {
	return createPublicMessageTool({
		ctx,
		toolName: "sendAcknowledgeMessage",
		description: "Send a short acknowledgement before the main response.",
	});
}

export function createSendMessageTool(ctx: PipelineToolContext) {
	return createPublicMessageTool({
		ctx,
		toolName: "sendMessage",
		description: "Send the main public response to the visitor.",
	});
}

export function createSendFollowUpMessageTool(ctx: PipelineToolContext) {
	return createPublicMessageTool({
		ctx,
		toolName: "sendFollowUpMessage",
		description: "Send one optional follow-up message after the main response.",
	});
}

export function createSendPrivateMessageTool(ctx: PipelineToolContext) {
	return tool({
		description: "Send an internal private note to teammates.",
		inputSchema: sendPrivateMessageInputSchema,
		execute: async ({
			message,
		}): Promise<PipelineToolResult<{ noteId: string; created: boolean }>> => {
			ctx.runtimeState.privateSendSequence += 1;
			const slot = ctx.runtimeState.privateSendSequence;
			const result = await addInternalNote({
				db: ctx.db,
				conversationId: ctx.conversationId,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				visitorId: ctx.visitorId,
				aiAgentId: ctx.aiAgentId,
				text: message,
				idempotencyKey: `private:${ctx.triggerMessageId}:slot:${slot}`,
			});

			return {
				success: true,
				data: {
					noteId: result.noteId,
					created: result.created,
				},
			};
		},
	});
}

export const SEND_ACKNOWLEDGE_MESSAGE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Sending acknowledgement...",
		result: "Sent acknowledgement",
		error: "Failed to send acknowledgement",
	},
	progress: {
		partial: "Sending acknowledgement...",
		result: "Acknowledgement sent",
		error: "Failed to send acknowledgement",
		audience: "all",
	},
};

export const SEND_MESSAGE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Sending main response...",
		result: "Sent main response",
		error: "Failed to send main response",
	},
	progress: {
		partial: "Preparing response...",
		result: "Response sent",
		error: "Failed to send response",
		audience: "all",
	},
};

export const SEND_FOLLOW_UP_MESSAGE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Sending follow-up...",
		result: "Sent follow-up",
		error: "Failed to send follow-up",
	},
	progress: {
		partial: "Sending follow-up...",
		result: "Follow-up sent",
		error: "Failed to send follow-up",
		audience: "all",
	},
};

export const SEND_PRIVATE_MESSAGE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Saving internal note...",
		result: "Saved internal note",
		error: "Failed to save internal note",
	},
	progress: {
		partial: "Saving internal note...",
		result: "Internal note saved",
		error: "Failed to save internal note",
		audience: "dashboard",
	},
};

export { PUBLIC_MESSAGE_TOOL_ORDER };
