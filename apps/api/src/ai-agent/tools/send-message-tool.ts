/**
 * Send Message to Visitor Tool
 *
 * Allows the AI to send messages to the visitor during generation.
 * This enables natural multi-message responses like humans send.
 */

import { tool } from "ai";
import { z } from "zod";
import { sendMessage } from "../actions/send-message";
import type { ToolContext, ToolResult } from "./types";

/** Counter for unique message IDs within a single generation */
let messageCounter = 0;

const inputSchema = z.object({
	message: z
		.string()
		.describe(
			"The message to send to the visitor. Keep it brief (1-2 sentences)."
		),
});

/**
 * Create the sendMessageToVisitor tool with bound context
 */
export function createSendMessageToVisitorTool(ctx: ToolContext) {
	// Reset counter for each new tool creation (new generation)
	messageCounter = 0;

	return tool({
		description:
			"Send a message to the visitor. ALWAYS use this instead of visitorMessage. Call multiple times - one sentence per call. Example: call once for greeting, once for main point, once for question.",
		inputSchema,
		execute: async ({
			message,
		}): Promise<ToolResult<{ sent: boolean; messageId: string }>> => {
			try {
				// Increment counter for unique key
				messageCounter++;
				const uniqueKey = `${ctx.triggerMessageId}-tool-msg-${messageCounter}`;

				console.log(
					`[tool:sendMessageToVisitor] conv=${ctx.conversationId} | sending message #${messageCounter}`
				);

				const result = await sendMessage({
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
					`[tool:sendMessageToVisitor] conv=${ctx.conversationId} | sent=${result.created} | messageId=${result.messageId}`
				);

				return {
					success: true,
					data: {
						sent: result.created,
						messageId: result.messageId,
					},
				};
			} catch (error) {
				console.error(
					`[tool:sendMessageToVisitor] conv=${ctx.conversationId} | Failed:`,
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
