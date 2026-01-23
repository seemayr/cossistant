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

/**
 * Store for capturing the action result within a generation.
 * This is set when an action tool is called.
 */
let capturedAction: {
	action: "respond" | "escalate" | "resolve" | "mark_spam" | "skip";
	reasoning: string;
	confidence: number;
	escalation?: { reason: string; urgency?: "normal" | "high" | "urgent" };
} | null = null;

/**
 * Reset the captured action (call before each generation)
 */
export function resetCapturedAction() {
	capturedAction = null;
}

/**
 * Get the captured action (call after generation)
 */
export function getCapturedAction() {
	return capturedAction;
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
export function createRespondTool() {
	return tool({
		description:
			"FINISH action: Call AFTER sendMessage() to complete your turn. Use when you've answered the visitor's question or provided the requested help. Do NOT call without first calling sendMessage().",
		inputSchema: respondSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<{ success: boolean; action: string }> => {
			capturedAction = {
				action: "respond",
				reasoning,
				confidence,
			};
			return { success: true, action: "respond" };
		},
	});
}

/**
 * Create the escalate tool - signals escalation to human
 */
export function createEscalateTool() {
	return tool({
		description:
			"FINISH action: Hand off to human support. Call AFTER sendMessage() telling the visitor you're connecting them with a team member. Also call sendPrivateMessage() to give the human agent context about the issue.",
		inputSchema: escalateSchema,
		execute: async ({
			reason,
			urgency,
			reasoning,
			confidence,
		}): Promise<{ success: boolean; action: string; reason: string }> => {
			capturedAction = {
				action: "escalate",
				reasoning,
				confidence,
				escalation: { reason, urgency: urgency ?? "normal" },
			};
			return { success: true, action: "escalate", reason };
		},
	});
}

/**
 * Create the resolve tool - signals conversation resolution
 */
export function createResolveTool() {
	return tool({
		description:
			"FINISH action: Mark conversation as resolved/complete. Call AFTER sendMessage() with a closing message. Use when the visitor's issue is fully addressed and they've confirmed satisfaction or said goodbye.",
		inputSchema: resolveSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<{ success: boolean; action: string }> => {
			capturedAction = {
				action: "resolve",
				reasoning,
				confidence,
			};
			return { success: true, action: "resolve" };
		},
	});
}

/**
 * Create the markSpam tool - signals spam detection
 */
export function createMarkSpamTool() {
	return tool({
		description:
			"FINISH action: Mark conversation as spam/abuse and close it. Use ONLY for obvious spam, bots, or abusive content. Does not require sendMessage() first since we don't respond to spam.",
		inputSchema: markSpamSchema,
		execute: async ({
			reasoning,
			confidence,
		}): Promise<{ success: boolean; action: string }> => {
			capturedAction = {
				action: "mark_spam",
				reasoning,
				confidence,
			};
			return { success: true, action: "mark_spam" };
		},
	});
}

/**
 * Create the skip tool - signals no action needed
 */
export function createSkipTool() {
	return tool({
		description:
			"FINISH action: Skip responding entirely. Use ONLY when a human agent is actively handling the conversation, or when the message doesn't require any response (e.g., visitor just said 'ok' or 'thanks'). Does not require sendMessage() first.",
		inputSchema: skipSchema,
		execute: async ({
			reasoning,
		}): Promise<{ success: boolean; action: string }> => {
			capturedAction = {
				action: "skip",
				reasoning,
				confidence: 1,
			};
			return { success: true, action: "skip" };
		},
	});
}
