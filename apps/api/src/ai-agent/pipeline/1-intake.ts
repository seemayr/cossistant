/**
 * Pipeline Step 1: Intake
 *
 * This step gathers all context needed for the AI agent to make decisions.
 * It validates the agent is active and loads conversation history with roles.
 *
 * Responsibilities:
 * - Validate AI agent exists and is active
 * - Load conversation with full context
 * - Build role-aware message history
 * - Load visitor information
 * - Check conversation state (assignees, escalation)
 */

import type { Database } from "@api/db";
import { getAiAgentById, updateAiAgentModel } from "@api/db/queries/ai-agent";
import {
	getConversationById,
	getMessageMetadata,
} from "@api/db/queries/conversation";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { resolveModelForExecution } from "@api/lib/ai-credits/config";
import {
	buildConversationHistory,
	type RoleAwareMessage,
} from "../context/conversation";
import { type ConversationState, getConversationState } from "../context/state";
import { getVisitorContext, type VisitorContext } from "../context/visitor";
import type { AiAgentPipelineInput } from "./index";

export type IntakeResult =
	| {
			status: "ready";
			aiAgent: AiAgentSelect;
			modelResolution: {
				modelIdOriginal: string;
				modelIdResolved: string;
				modelMigrationApplied: boolean;
			};
			conversation: ConversationSelect;
			conversationHistory: RoleAwareMessage[];
			visitorContext: VisitorContext | null;
			conversationState: ConversationState;
			triggerMessage: RoleAwareMessage | null;
	  }
	| {
			status: "skipped";
			reason: string;
	  };

/**
 * Gather all context needed for AI agent processing
 */
export async function intake(
	db: Database,
	input: AiAgentPipelineInput
): Promise<IntakeResult> {
	// Validate AI agent exists and is active
	const aiAgent = await getAiAgentById(db, { aiAgentId: input.aiAgentId });

	if (!aiAgent) {
		return {
			status: "skipped",
			reason: `AI agent ${input.aiAgentId} not found`,
		};
	}

	if (!aiAgent.isActive) {
		return {
			status: "skipped",
			reason: `AI agent ${input.aiAgentId} is not active`,
		};
	}

	const modelResolution = resolveModelForExecution(aiAgent.model);
	let resolvedAiAgent = aiAgent;
	if (modelResolution.modelMigrationApplied) {
		console.warn(
			`[ai-agent:intake] conv=${input.conversationId} | Migrating unknown AI model to default`,
			{
				aiAgentId: aiAgent.id,
				modelIdOriginal: modelResolution.modelIdOriginal,
				modelIdResolved: modelResolution.modelIdResolved,
				migrationApplied: true,
			}
		);

		try {
			const persisted = await updateAiAgentModel(db, {
				aiAgentId: aiAgent.id,
				model: modelResolution.modelIdResolved,
			});
			if (persisted) {
				resolvedAiAgent = persisted;
			} else {
				resolvedAiAgent = {
					...aiAgent,
					model: modelResolution.modelIdResolved,
				};
			}
		} catch (error) {
			console.warn(
				`[ai-agent:intake] conv=${input.conversationId} | Failed to persist migrated AI model`,
				error
			);
			resolvedAiAgent = {
				...aiAgent,
				model: modelResolution.modelIdResolved,
			};
		}
	}

	// Load conversation and trigger metadata together (independent queries)
	const [conversation, triggerMetadata] = await Promise.all([
		getConversationById(db, {
			conversationId: input.conversationId,
		}),
		getMessageMetadata(db, {
			messageId: input.messageId,
			organizationId: input.organizationId,
		}),
	]);

	if (!conversation) {
		return {
			status: "skipped",
			reason: `Conversation ${input.conversationId} not found`,
		};
	}

	if (!triggerMetadata) {
		return {
			status: "skipped",
			reason: `Trigger message ${input.messageId} not found`,
		};
	}

	// Load remaining independent context in parallel
	const [conversationHistory, visitorContext, conversationState] =
		await Promise.all([
			buildConversationHistory(db, {
				conversationId: input.conversationId,
				organizationId: input.organizationId,
				websiteId: input.websiteId,
				maxCreatedAt: triggerMetadata.createdAt,
				maxId: triggerMetadata.id,
			}),
			getVisitorContext(db, input.visitorId),
			getConversationState(
				db,
				{
					conversationId: input.conversationId,
					organizationId: input.organizationId,
				},
				conversation
			),
		]);

	// Find the trigger message
	const triggerMessage =
		conversationHistory.find((msg) => msg.messageId === input.messageId) ??
		null;

	console.log(
		`[ai-agent:intake] conv=${input.conversationId} | messages=${conversationHistory.length} | hasVisitor=${!!visitorContext} | trigger=${triggerMessage?.senderType ?? "unknown"} | modelOriginal=${modelResolution.modelIdOriginal} | modelResolved=${modelResolution.modelIdResolved} | migration=${modelResolution.modelMigrationApplied}`
	);

	return {
		status: "ready",
		aiAgent: resolvedAiAgent,
		modelResolution,
		conversation,
		conversationHistory,
		visitorContext,
		conversationState,
		triggerMessage,
	};
}
