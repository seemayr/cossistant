/**
 * AI Decision Parser
 *
 * Parses and validates AI decision output.
 */

import { type AiDecision, aiDecisionSchema } from "./schemas";

/**
 * Parse and validate an AI decision
 *
 * Returns a validated decision or a fallback "skip" decision on error.
 */
export function parseAiDecision(input: unknown): AiDecision {
	const result = aiDecisionSchema.safeParse(input);

	if (result.success) {
		return result.data;
	}

	console.error("[ai-agent] Failed to parse AI decision:", result.error.issues);

	// Return a safe fallback
	return {
		action: "skip",
		reasoning: "Failed to parse AI decision, skipping for safety",
		confidence: 0,
	};
}

/**
 * Validate that a decision is safe to execute
 */
export function validateDecisionForExecution(decision: AiDecision): {
	valid: boolean;
	error?: string;
} {
	switch (decision.action) {
		case "escalate":
			if (!decision.escalation?.reason) {
				return {
					valid: false,
					error: "Escalation requires a reason",
				};
			}
			break;

		case "respond":
		case "resolve":
		case "mark_spam":
		case "skip":
			// No special validation needed - messages are sent via tools
			break;

		default:
			return {
				valid: false,
				error: `Unknown action: ${decision.action}`,
			};
	}

	return { valid: true };
}
