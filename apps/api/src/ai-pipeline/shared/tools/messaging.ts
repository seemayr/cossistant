import { addInternalNote } from "@api/ai-agent/actions/internal-note";
import { sendMessage as sendPublicMessage } from "@api/ai-agent/actions/send-message";
import { tool } from "ai";
import { z } from "zod";
import type {
	PipelineToolContext,
	PipelineToolResult,
	ToolTelemetrySpec,
} from "./contracts";

const sendMessageInputSchema = z.object({
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

export function createSendMessageTool(ctx: PipelineToolContext) {
	let sendChain: Promise<void> = Promise.resolve();
	let nextCreatedAtMs = Date.now();

	const runSequentially = async <T>(run: () => Promise<T>): Promise<T> => {
		const queued = sendChain.then(run);
		sendChain = queued.then(
			() => {},
			() => {}
		);
		return queued;
	};

	return tool({
		description: "Send a public message visible to the visitor.",
		inputSchema: sendMessageInputSchema,
		execute: ({ message }) =>
			runSequentially<
				PipelineToolResult<{ messageId: string; created: boolean }>
			>(async () => {
				if (!ctx.allowPublicMessages) {
					return {
						success: false,
						error: "Public messages are disabled for this generation mode",
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
				nextCreatedAtMs = Math.max(nextCreatedAtMs + 1, Date.now());
				const createdAt = new Date(nextCreatedAtMs);

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
					idempotencyKey: `public:${ctx.triggerMessageId}:slot:${slot}`,
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
			}),
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

export const SEND_MESSAGE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Sending message to visitor...",
		result: "Sent visitor message",
		error: "Failed to send visitor message",
	},
	progress: {
		partial: "Preparing response...",
		result: "Response sent",
		error: "Failed to send response",
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
