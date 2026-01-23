/**
 * Send Private Message Tool
 *
 * Sends a private note visible only to the team.
 */

import { tool } from "ai";
import { z } from "zod";
import { addInternalNote } from "../actions/internal-note";
import type { ToolContext, ToolResult } from "./types";

/** Counter for unique note IDs within a single generation */
let noteCounter = 0;

const inputSchema = z.object({
	message: z
		.string()
		.describe(
			"Internal note text for the support team. Include relevant context like order numbers, issue summaries, or handoff instructions."
		),
});

/**
 * Create the sendPrivateMessage tool
 */
export function createSendPrivateMessageTool(ctx: ToolContext) {
	// Reset counter for each new tool creation (new generation)
	noteCounter = 0;

	return tool({
		description:
			"Send an internal note visible ONLY to the support team (visitor cannot see). Use when escalating to provide context, or to document important information for human agents.",
		inputSchema,
		execute: async ({
			message,
		}): Promise<ToolResult<{ sent: boolean; noteId: string }>> => {
			try {
				noteCounter++;
				const uniqueKey = `${ctx.triggerMessageId}-private-${noteCounter}`;

				console.log(
					`[tool:sendPrivateMessage] conv=${ctx.conversationId} | sending #${noteCounter}`
				);

				const result = await addInternalNote({
					db: ctx.db,
					conversationId: ctx.conversationId,
					organizationId: ctx.organizationId,
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
