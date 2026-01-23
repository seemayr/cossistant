/**
 * AI Decision Schema
 *
 * Defines the structured output format for AI agent decisions.
 * The AI must return a decision in this format, not free-form text.
 */

import { z } from "zod";

/**
 * Escalation details when the AI decides to escalate
 */
export const escalationSchema = z.object({
	/** Reason for escalation (shown to human agents) */
	reason: z.string().describe("Brief reason for escalating to a human agent"),
	/** Message to send to the visitor explaining the escalation */
	visitorMessage: z
		.string()
		.describe(
			"A friendly message to the visitor explaining that a human will help them soon"
		),
	/** Specific user to assign to (optional) */
	assignToUserId: z
		.string()
		.optional()
		.describe("User ID to assign the conversation to"),
	/** Urgency level */
	urgency: z
		.enum(["normal", "high", "urgent"])
		.optional()
		.describe("How urgently human attention is needed"),
});

/**
 * The main AI decision schema
 *
 * The AI returns a structured decision that determines what action to take.
 * This prevents the AI from responding when it shouldn't.
 *
 * Note: Priority, title, and sentiment are now handled via tools during generation.
 */
export const aiDecisionSchema = z.object({
	/** The primary action to take */
	action: z
		.enum([
			"respond", // Send a visible message to the visitor
			"internal_note", // Add a private note for the team
			"escalate", // Escalate to a human agent
			"resolve", // Mark the conversation as resolved
			"mark_spam", // Mark the conversation as spam
			"skip", // Take no action
		])
		.describe("The primary action to take"),

	/**
	 * Message to show the visitor.
	 * ALWAYS provide a message unless you used sendMessageToVisitor tool.
	 */
	visitorMessage: z
		.string()
		.describe(
			"Your response to the visitor. Keep it brief (1-2 sentences). " +
				"Required for respond/escalate/resolve actions."
		),

	/** Optional internal note for the team (private, not visible to visitor) */
	internalNote: z
		.string()
		.optional()
		.describe(
			"Optional private note for the support team about this action or decision"
		),

	/** Escalation details (required if action is escalate) */
	escalation: escalationSchema
		.optional()
		.describe("Escalation details (required if action is escalate)"),

	/** AI's reasoning for this decision (for debugging/audit) */
	reasoning: z
		.string()
		.describe("Brief explanation of why this action was chosen"),

	/** Confidence in the decision (0-1) */
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("How confident the AI is in this decision (0 to 1)"),
});

export type AiDecision = z.infer<typeof aiDecisionSchema>;
export type Escalation = z.infer<typeof escalationSchema>;
