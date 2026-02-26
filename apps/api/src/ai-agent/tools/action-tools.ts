/**
 * Action Tools
 *
 * These tools signal what action the AI wants to take.
 * The AI MUST call one of these after sending messages.
 *
 * This replaces structured output to force tool usage.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ActionCapture, CapturedAction, ToolContext } from "./types";

async function stopTypingIfNeeded(
	ctx: ToolContext | undefined,
	toolName: string
) {
	if (!ctx?.stopTyping) {
		return;
	}
	try {
		await ctx.stopTyping();
	} catch (error) {
		console.warn(`[tool:${toolName}] Failed to stop typing`, error);
	}
}

function createDefaultCapture(): ActionCapture {
	let capturedAction: CapturedAction | null = null;
	return {
		get: () => capturedAction,
		set: (action) => {
			capturedAction = action;
		},
		reset: () => {
			capturedAction = null;
		},
	};
}

const defaultCapture = createDefaultCapture();

export function createActionCapture(): ActionCapture {
	return createDefaultCapture();
}

/**
 * Reset the captured action (call before each generation)
 */
export function resetCapturedAction(capture: ActionCapture = defaultCapture) {
	capture.reset();
}

/**
 * Get the captured action (call after generation)
 */
export function getCapturedAction(capture: ActionCapture = defaultCapture) {
	return capture.get();
}

// Schemas for action tools
const respondSchema = z.object({
	reasoning: z
		.string()
		.describe("Brief explanation of why you responded this way"),
	confidence: z.number().min(0).max(1).describe("How confident you are (0-1)"),
});

const escalateSchema = z.object({
	reason: z
		.string()
		.describe(
			"Why escalating - be specific so the human knows what to help with"
		),
	urgency: z
		.enum(["normal", "high", "urgent"])
		.nullable()
		.describe("How urgent is this escalation"),
	reasoning: z
		.string()
		.describe("Internal reasoning for why you chose to escalate"),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("How confident you are this needs escalation (0-1)"),
});

const resolveSchema = z.object({
	reasoning: z
		.string()
		.describe("Why you believe the conversation is resolved"),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("How confident you are it's resolved (0-1)"),
});

const markSpamSchema = z.object({
	reasoning: z.string().describe("Why you believe this is spam"),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("How confident you are it's spam (0-1)"),
});

const skipSchema = z.object({
	reasoning: z.string().describe("Why no response is needed"),
});

/**
 * Create the respond tool - signals normal response completion
 */
export function createRespondTool(ctx?: ToolContext) {
	return tool({
		description: "Finish the run with a normal response outcome.",
		inputSchema: respondSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<{ success: boolean; action: string }> => {
			await stopTypingIfNeeded(ctx, "respond");
			const capture = ctx?.actionCapture ?? defaultCapture;
			capture.set({
				action: "respond",
				reasoning,
				confidence,
			});
			return { success: true, action: "respond" };
		},
	});
}

/**
 * Create the escalate tool - signals escalation to human
 */
export function createEscalateTool(ctx?: ToolContext) {
	return tool({
		description: "Finish the run with an escalation to human support.",
		inputSchema: escalateSchema,
		execute: async ({
			reason,
			urgency,
			reasoning,
			confidence,
		}): Promise<{
			success: boolean;
			action: string;
			reason: string;
			alreadyEscalated?: boolean;
		}> => {
			await stopTypingIfNeeded(ctx, "escalate");
			const capture = ctx?.actionCapture ?? defaultCapture;
			// Check if already escalated - prevent re-escalation
			if (ctx?.isEscalated) {
				console.log(
					`[tool:escalate] conv=${ctx.conversationId} | Already escalated, skipping re-escalation`
				);
				// Still capture the action but mark it to be handled differently
				capture.set({
					action: "respond", // Change to respond since we can't re-escalate
					reasoning: `Attempted to escalate but conversation is already escalated. Original reasoning: ${reasoning}`,
					confidence,
				});
				return {
					success: false,
					action: "respond",
					reason: "Conversation is already escalated to human support",
					alreadyEscalated: true,
				};
			}

			capture.set({
				action: "escalate",
				reasoning,
				confidence,
				escalation: { reason, urgency: urgency ?? "normal" },
			});
			return { success: true, action: "escalate", reason };
		},
	});
}

/**
 * Create the resolve tool - signals conversation resolution
 */
export function createResolveTool(ctx?: ToolContext) {
	return tool({
		description: "Finish the run by marking the conversation resolved.",
		inputSchema: resolveSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<{ success: boolean; action: string }> => {
			await stopTypingIfNeeded(ctx, "resolve");
			const capture = ctx?.actionCapture ?? defaultCapture;
			capture.set({
				action: "resolve",
				reasoning,
				confidence,
			});
			return { success: true, action: "resolve" };
		},
	});
}

/**
 * Create the markSpam tool - signals spam detection
 */
export function createMarkSpamTool(ctx?: ToolContext) {
	return tool({
		description: "Finish the run by marking the conversation as spam/abuse.",
		inputSchema: markSpamSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<{ success: boolean; action: string }> => {
			await stopTypingIfNeeded(ctx, "markSpam");
			const capture = ctx?.actionCapture ?? defaultCapture;
			capture.set({
				action: "mark_spam",
				reasoning,
				confidence,
			});
			return { success: true, action: "mark_spam" };
		},
	});
}

/**
 * Create the skip tool - signals no action needed
 */
export function createSkipTool(ctx?: ToolContext) {
	return tool({
		description: "Finish the run without sending any public reply.",
		inputSchema: skipSchema,
		execute: async ({
			reasoning,
		}): Promise<{ success: boolean; action: string }> => {
			await stopTypingIfNeeded(ctx, "skip");
			const capture = ctx?.actionCapture ?? defaultCapture;
			capture.set({
				action: "skip",
				reasoning,
				confidence: 1,
			});
			return { success: true, action: "skip" };
		},
	});
}
