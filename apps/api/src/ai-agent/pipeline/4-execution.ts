/**
 * Pipeline Step 4: Execution
 *
 * Executes the AI's chosen action.
 * Messages are already sent via tools during generation.
 *
 * This step handles:
 * - escalate: Update conversation status, notify team
 * - resolve: Mark conversation as resolved
 * - mark_spam: Mark as spam
 * - respond/skip: No additional action needed
 */

import type { Database } from "@api/db";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import * as actions from "../actions";
import { validateDecisionForExecution } from "../output/parser";
import type { AiDecision } from "../output/schemas";

export type ExecutionResult = {
	primaryAction: {
		type: string;
		success: boolean;
		error?: string;
	};
};

type ExecutionInput = {
	db: Database;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	decision: AiDecision;
	jobId: string;
	messageId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	visitorName: string;
};

/**
 * Execute the AI's chosen action
 */
export async function execute(input: ExecutionInput): Promise<ExecutionResult> {
	const {
		db,
		aiAgent,
		conversation,
		decision,
		organizationId,
		websiteId,
		visitorName,
	} = input;
	const convId = conversation.id;

	console.log(
		`[ai-agent:execute] conv=${convId} | action="${decision.action}" | confidence=${decision.confidence}`
	);

	// Confidence-based escalation override
	if (decision.confidence < 0.6 && decision.action === "respond") {
		console.log(
			`[ai-agent:execute] conv=${convId} | Low confidence (${decision.confidence}), should have escalated`
		);
		// Note: We don't override here anymore - the AI should have sent messages via tools
		// and included escalation. If it didn't, we just log the warning.
	}

	// Validate decision
	const validation = validateDecisionForExecution(decision);
	if (!validation.valid) {
		console.error(
			`[ai-agent:execute] conv=${convId} | Invalid decision | error="${validation.error}"`
		);
		return {
			primaryAction: {
				type: decision.action,
				success: false,
				error: validation.error,
			},
		};
	}

	const result: ExecutionResult = {
		primaryAction: {
			type: decision.action,
			success: false,
		},
	};

	try {
		switch (decision.action) {
			case "respond":
			case "skip": {
				// Messages already sent via tools - nothing more to do
				result.primaryAction = {
					type: decision.action,
					success: true,
				};
				break;
			}

			case "escalate": {
				await actions.escalate({
					db,
					conversation,
					organizationId,
					websiteId,
					aiAgentId: aiAgent.id,
					aiAgentName: aiAgent.name,
					reason: decision.escalation?.reason ?? "AI requested escalation",
					visitorMessage: null, // Already sent via tool
					visitorName,
					assignToUserId: null,
					urgency: decision.escalation?.urgency ?? "normal",
				});
				result.primaryAction = {
					type: "escalate",
					success: true,
				};
				break;
			}

			case "resolve": {
				await actions.updateStatus({
					db,
					conversation,
					organizationId,
					websiteId,
					aiAgentId: aiAgent.id,
					newStatus: "resolved",
				});
				result.primaryAction = {
					type: "resolve",
					success: true,
				};
				break;
			}

			case "mark_spam": {
				await actions.updateStatus({
					db,
					conversation,
					organizationId,
					websiteId,
					aiAgentId: aiAgent.id,
					newStatus: "spam",
				});
				result.primaryAction = {
					type: "mark_spam",
					success: true,
				};
				break;
			}

			default: {
				result.primaryAction = {
					type: decision.action,
					success: false,
					error: `Unknown action: ${decision.action}`,
				};
			}
		}
	} catch (error) {
		result.primaryAction = {
			type: decision.action,
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}

	if (result.primaryAction.success) {
		console.log(`[ai-agent:execute] conv=${convId} | success=true`);
	} else {
		console.error(
			`[ai-agent:execute] conv=${convId} | FAILED | error="${result.primaryAction.error}"`
		);
	}

	return result;
}
