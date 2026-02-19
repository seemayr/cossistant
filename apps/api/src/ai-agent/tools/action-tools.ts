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

const waitSchema = z.object({
	reasoning: z
		.string()
		.describe(
			"Why waiting is better than responding right now (for example, expecting immediate follow-up context)"
		),
});

/**
 * Create the respond tool - signals normal response completion
 */
export function createRespondTool(ctx?: ToolContext) {
	return tool({
		description:
			"FINISH action: Call AFTER sendMessage() to complete your turn. Use when you've answered the visitor's question or provided the requested help. Do NOT call without first calling sendMessage().",
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
		description:
			"FINISH action: Hand off to human support. Call AFTER sendMessage() telling the visitor you're connecting them with a team member. Also call sendPrivateMessage() to give the human agent context about the issue. DO NOT call this if the conversation is already escalated.",
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
		description:
			"FINISH action: Mark conversation as resolved/complete. Call AFTER sendMessage() with a closing message. Use when the visitor's issue is fully addressed and they've confirmed satisfaction or said goodbye.",
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
		description:
			"FINISH action: Mark conversation as spam/abuse and close it. Use ONLY for obvious spam, bots, or abusive content. Does not require sendMessage() first since we don't respond to spam.",
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
		description:
			"FINISH action: Skip responding entirely. Use ONLY when a human agent is actively handling the conversation, or when the message doesn't require any response (e.g., visitor just said 'ok' or 'thanks'). Does not require sendMessage() first.",
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

/**
 * Create the wait tool - signals defer and re-evaluate soon
 */
export function createWaitTool(ctx?: ToolContext) {
	return tool({
		description:
			"FINISH action: Wait briefly and re-evaluate from decision stage. Use when more immediate context may arrive and sending now would likely interrupt or duplicate.",
		inputSchema: waitSchema,
		execute: async ({
			reasoning,
		}): Promise<{ success: boolean; action: string }> => {
			await stopTypingIfNeeded(ctx, "wait");
			const capture = ctx?.actionCapture ?? defaultCapture;
			capture.set({
				action: "wait",
				reasoning,
				confidence: 1,
			});
			return { success: true, action: "wait" };
		},
	});
}
