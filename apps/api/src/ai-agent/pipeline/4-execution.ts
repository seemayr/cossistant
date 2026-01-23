/**
 * Pipeline Step 4: Execution
 *
 * This step executes the AI's chosen actions.
 * All actions are idempotent to support safe retries.
 *
 * Responsibilities:
 * - Execute primary action (respond, escalate, resolve, etc.)
 * - Create timeline events
 * - Update conversation state
 *
 * Note: Priority, title, and sentiment are now handled via SDK tools during generation.
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
		messageId?: string;
		error?: string;
	};
};

type ExecutionInput = {
	db: Database;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	decision: AiDecision;
	jobId: string;
	messageId: string; // Trigger message ID - used for idempotency
	organizationId: string;
	websiteId: string;
	visitorId: string;
	visitorName: string;
};

/**
 * Execute the AI's chosen actions
 */
export async function execute(input: ExecutionInput): Promise<ExecutionResult> {
	const {
		db,
		aiAgent,
		conversation,
		decision,
		messageId,
		organizationId,
		websiteId,
		visitorId,
		visitorName,
	} = input;
	const convId = conversation.id;

	console.log(
		`[ai-agent:execute] conv=${convId} | Executing action="${decision.action}" | confidence=${decision.confidence}`
	);

	// Confidence-based escalation: if AI is uncertain, escalate instead of responding
	if (decision.confidence < 0.6 && decision.action === "respond") {
		console.log(
			`[ai-agent:execute] conv=${convId} | Low confidence (${decision.confidence}), overriding to escalate`
		);
		decision.action = "escalate";
		decision.escalation = {
			reason: "AI uncertain about response",
			visitorMessage:
				decision.visitorMessage ||
				"Let me connect you with the team for a definitive answer.",
			urgency: "normal",
		};
	}

	// Validate decision before execution
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

	// Get the visitor message
	const visitorMessage = decision.visitorMessage || "";

	// Execute primary action
	try {
		switch (decision.action) {
			case "respond": {
				// If visitorMessage is empty, the AI likely already sent messages via tool
				if (visitorMessage) {
					const sendResult = await actions.sendMessage({
						db,
						conversationId: conversation.id,
						organizationId,
						websiteId,
						visitorId,
						aiAgentId: aiAgent.id,
						text: visitorMessage,
						idempotencyKey: `${messageId}-respond`,
					});
					result.primaryAction = {
						type: "respond",
						success: true,
						messageId: sendResult.messageId,
					};
				} else {
					// No message to send - likely already sent via sendMessageToVisitor tool
					console.log(
						`[ai-agent:execute] conv=${convId} | No visitorMessage - likely sent via tool`
					);
					result.primaryAction = {
						type: "respond",
						success: true,
					};
				}
				break;
			}

			case "internal_note": {
				const noteText = decision.internalNote || visitorMessage;
				const noteResult = await actions.addInternalNote({
					db,
					conversationId: conversation.id,
					organizationId,
					aiAgentId: aiAgent.id,
					text: noteText,
					idempotencyKey: `${messageId}-note`,
				});
				result.primaryAction = {
					type: "internal_note",
					success: true,
					messageId: noteResult.noteId,
				};

				// If there's also a visitor message, send it
				if (visitorMessage && visitorMessage !== noteText) {
					await actions.sendMessage({
						db,
						conversationId: conversation.id,
						organizationId,
						websiteId,
						visitorId,
						aiAgentId: aiAgent.id,
						text: visitorMessage,
						idempotencyKey: `${messageId}-note-visitor`,
					});
				}
				break;
			}

			case "escalate": {
				const escalationVisitorMessage =
					decision.escalation?.visitorMessage ||
					visitorMessage ||
					"I'm connecting you with one of our team members who can help you further. They'll be with you shortly!";

				await actions.escalate({
					db,
					conversation,
					organizationId,
					websiteId,
					aiAgentId: aiAgent.id,
					aiAgentName: aiAgent.name,
					reason: decision.escalation?.reason ?? "AI requested escalation",
					visitorMessage: escalationVisitorMessage,
					visitorName,
					assignToUserId: decision.escalation?.assignToUserId,
					urgency: decision.escalation?.urgency ?? "normal",
				});
				result.primaryAction = {
					type: "escalate",
					success: true,
				};
				break;
			}

			case "resolve": {
				// Send visitor message BEFORE updating status
				if (visitorMessage) {
					await actions.sendMessage({
						db,
						conversationId: conversation.id,
						organizationId,
						websiteId,
						visitorId,
						aiAgentId: aiAgent.id,
						text: visitorMessage,
						idempotencyKey: `${messageId}-resolve-msg`,
					});
				}

				await actions.updateStatus({
					db,
					conversation,
					organizationId,
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
				if (visitorMessage) {
					await actions.sendMessage({
						db,
						conversationId: conversation.id,
						organizationId,
						websiteId,
						visitorId,
						aiAgentId: aiAgent.id,
						text: visitorMessage,
						idempotencyKey: `${messageId}-spam-msg`,
					});
				}

				await actions.updateStatus({
					db,
					conversation,
					organizationId,
					aiAgentId: aiAgent.id,
					newStatus: "spam",
				});
				result.primaryAction = {
					type: "mark_spam",
					success: true,
				};
				break;
			}

			case "skip": {
				// Even on skip, send visitor message if provided
				if (visitorMessage) {
					await actions.sendMessage({
						db,
						conversationId: conversation.id,
						organizationId,
						websiteId,
						visitorId,
						aiAgentId: aiAgent.id,
						text: visitorMessage,
						idempotencyKey: `${messageId}-skip-msg`,
					});
				}

				result.primaryAction = {
					type: "skip",
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

	// Handle internal note as a side effect if provided and not the primary action
	if (decision.internalNote && decision.action !== "internal_note") {
		try {
			await actions.addInternalNote({
				db,
				conversationId: conversation.id,
				organizationId,
				aiAgentId: aiAgent.id,
				text: decision.internalNote,
				idempotencyKey: `${messageId}-internal-note`,
			});
		} catch (error) {
			console.error(
				`[ai-agent:execute] conv=${convId} | Failed to add internal note:`,
				error
			);
		}
	}

	if (result.primaryAction.success) {
		console.log(`[ai-agent:execute] conv=${convId} | Result: success=true`);
	} else {
		console.error(
			`[ai-agent:execute] conv=${convId} | FAILED | error="${result.primaryAction.error}"`
		);
	}

	return result;
}
