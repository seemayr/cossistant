/**
 * AI Decision Schema
 *
 * Defines the structured output format for AI agent decisions.
 *
 * IMPORTANT: Messages are sent via tools (sendMessage, sendPrivateMessage).
 * This schema only declares the ACTION to take, not the messages.
 */

import { z } from "zod";

/**
 * Escalation details when the AI decides to escalate
 */
export const escalationSchema = z.object({
	/** Reason for escalation - context for the human agent */
	reason: z
		.string()
		.describe(
			"Context for the human: what the visitor needs, what you tried, what they should know"
		),
	/** Urgency level */
	urgency: z
		.enum(["normal", "high", "urgent"])
		.optional()
		.describe("How urgently human attention is needed"),
});

/**
 * The main AI decision schema
 *
 * Messages are sent via sendMessage() and sendPrivateMessage() tools.
 * This schema only declares what action to take.
 */
export const aiDecisionSchema = z.object({
	/** The action to take */
	action: z
		.enum([
			"respond", // Normal response (messages sent via tool)
			"escalate", // Escalate to human (must include escalation details)
			"resolve", // Mark conversation as resolved
			"mark_spam", // Mark as spam
			"skip", // No action needed
		])
		.describe("The action to take after sending messages"),

	/** Escalation details (required if action is escalate) */
	escalation: escalationSchema
		.optional()
		.describe("Required when action is escalate - context for the human"),

	/** Brief reasoning for audit/debugging */
	reasoning: z.string().describe("Why this action was chosen"),

	/** Confidence in the decision (0-1) */
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe(
			"Confidence in this decision (0-1). Below 0.6 = consider escalating"
		),
});

export type AiDecision = z.infer<typeof aiDecisionSchema>;
export type Escalation = z.infer<typeof escalationSchema>;
