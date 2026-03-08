import type { Database } from "@api/db";
import { getAiAgentById } from "@api/db/queries/ai-agent";
import { logAiPipeline } from "../../../logger";
import type { PrimaryPipelineInput } from "../../contracts";
import { loadConversationSeed, loadIntakeContext } from "./load-context";
import { resolveAndPersistModel } from "./model-resolution";
import type { IntakeStepResult } from "./types";

export async function runIntakeStep(params: {
	db: Database;
	input: PrimaryPipelineInput;
}): Promise<IntakeStepResult> {
	const aiAgent = await getAiAgentById(params.db, {
		aiAgentId: params.input.aiAgentId,
	});

	if (!aiAgent) {
		return {
			status: "skipped",
			reason: `AI agent ${params.input.aiAgentId} not found`,
			cursorDisposition: "retry",
		};
	}

	if (!aiAgent.isActive) {
		return {
			status: "skipped",
			reason: `AI agent ${params.input.aiAgentId} is not active`,
			cursorDisposition: "retry",
		};
	}

	const { aiAgent: resolvedAiAgent, modelResolution } =
		await resolveAndPersistModel({
			db: params.db,
			aiAgent,
			conversationId: params.input.conversationId,
		});

	const { conversation, triggerMetadata } = await loadConversationSeed(
		params.db,
		{
			conversationId: params.input.conversationId,
			messageId: params.input.messageId,
			organizationId: params.input.organizationId,
		}
	);

	if (!conversation) {
		return {
			status: "skipped",
			reason: `Conversation ${params.input.conversationId} not found`,
			cursorDisposition: "advance",
		};
	}

	if (!triggerMetadata) {
		return {
			status: "skipped",
			reason: `Trigger message ${params.input.messageId} not found`,
			cursorDisposition: "advance",
		};
	}

	if (triggerMetadata.conversationId !== params.input.conversationId) {
		return {
			status: "skipped",
			reason: `Trigger message ${params.input.messageId} does not belong to conversation ${params.input.conversationId}`,
			cursorDisposition: "advance",
		};
	}

	const context = await loadIntakeContext(params.db, {
		conversationId: params.input.conversationId,
		organizationId: params.input.organizationId,
		websiteId: params.input.websiteId,
		visitorId: params.input.visitorId,
		conversation,
		triggerMetadata,
	});

	logAiPipeline({
		area: "intake",
		event: "ready",
		conversationId: params.input.conversationId,
		fields: {
			messages: context.conversationHistory.length,
			hasVisitor: Boolean(context.visitorContext),
			triggerSender: context.triggerMessage?.senderType ?? "unknown",
			modelOriginal: modelResolution.modelIdOriginal,
			model: modelResolution.modelIdResolved,
			migration: modelResolution.modelMigrationApplied,
		},
	});

	return {
		status: "ready",
		data: {
			aiAgent: resolvedAiAgent,
			modelResolution,
			conversation,
			conversationHistory: context.conversationHistory,
			visitorContext: context.visitorContext,
			conversationState: context.conversationState,
			triggerMessage: context.triggerMessage,
			triggerMessageText: context.triggerMessageText,
			continuationContext: context.continuationContext,
		},
	};
}
