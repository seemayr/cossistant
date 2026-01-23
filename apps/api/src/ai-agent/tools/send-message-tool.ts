/**
 * Send Message Tool
 *
 * Sends a public message to the visitor.
 */

import { tool } from "ai";
import { z } from "zod";
import { sendMessage as sendMessageAction } from "../actions/send-message";
import type { ToolContext, ToolResult } from "./types";

/** Counter for unique message IDs within a single generation */
let messageCounter = 0;

const inputSchema = z.object({
	message: z
		.string()
		.describe(
			"The message text to send to the visitor. Keep each message to 1-2 sentences for readability."
		),
});

/**
 * Create the sendMessage tool
 */
export function createSendMessageTool(ctx: ToolContext) {
	// Reset counter for each new tool creation (new generation)
	messageCounter = 0;

	return tool({
		description:
			"REQUIRED: Send a visible message to the visitor. The visitor ONLY sees messages sent through this tool. Call this BEFORE any action tool (respond, escalate, resolve). You can call multiple times for multi-part responses.",
		inputSchema,
		execute: async ({
			message,
		}): Promise<ToolResult<{ sent: boolean; messageId: string }>> => {
			try {
				messageCounter++;
				const uniqueKey = `${ctx.triggerMessageId}-msg-${messageCounter}`;

				console.log(
					`[tool:sendMessage] conv=${ctx.conversationId} | sending #${messageCounter}`
				);

				const result = await sendMessageAction({
					db: ctx.db,
					conversationId: ctx.conversationId,
					organizationId: ctx.organizationId,
					websiteId: ctx.websiteId,
					visitorId: ctx.visitorId,
					aiAgentId: ctx.aiAgentId,
					text: message,
					idempotencyKey: uniqueKey,
				});

				console.log(
					`[tool:sendMessage] conv=${ctx.conversationId} | sent=${result.created}`
				);

				return {
					success: true,
					data: { sent: result.created, messageId: result.messageId },
				};
			} catch (error) {
				console.error(
					`[tool:sendMessage] conv=${ctx.conversationId} | Failed:`,
					error
				);
				return {
					success: false,
					error:
						error instanceof Error ? error.message : "Failed to send message",
				};
			}
		},
	});
}
