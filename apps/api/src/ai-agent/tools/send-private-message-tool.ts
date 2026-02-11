/**
 * Send Private Message Tool
 *
 * Sends a private note visible only to the team.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, ToolResult } from "./types";

const inputSchema = z.object({
	message: z
		.string()
		.describe(
			"Internal note text for the support team. Include relevant context like order numbers, issue summaries, or handoff instructions."
		),
});

/**
 * Create the sendPrivateMessage tool
 *
 * Uses counters from ToolContext instead of module-level state to ensure
 * proper isolation in worker/serverless environments.
 */
export function createSendPrivateMessageTool(ctx: ToolContext) {
	return tool({
		description:
			"Send an internal note visible ONLY to the support team (visitor cannot see). Use when escalating to provide context, or to document important information for human agents.",
		inputSchema,
		execute: async ({
			message,
		}): Promise<ToolResult<{ sent: boolean; noteId: string }>> => {
			try {
				// Defensive initialization for counters (handles hot reload edge cases)
				const counters = ctx.counters ?? {
					sendMessage: 0,
					sendPrivateMessage: 0,
				};
				if (!ctx.counters) {
					ctx.counters = counters;
				}

				// Increment counter in context (shared mutable object)
				counters.sendPrivateMessage++;
				const noteNumber = counters.sendPrivateMessage;
				const uniqueKey = `${ctx.triggerMessageId}-private-${noteNumber}`;

				console.log(
					`[tool:sendPrivateMessage] conv=${ctx.conversationId} | sending #${noteNumber}`
				);

				const { addInternalNote } = await import("../actions/internal-note");
				const result = await addInternalNote({
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
					`[tool:sendPrivateMessage] conv=${ctx.conversationId} | sent=${result.created}`
				);

				return {
					success: true,
					data: { sent: result.created, noteId: result.noteId },
				};
			} catch (error) {
				console.error(
					`[tool:sendPrivateMessage] conv=${ctx.conversationId} | Failed:`,
					error
				);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Failed to send note",
				};
			}
		},
	});
}
