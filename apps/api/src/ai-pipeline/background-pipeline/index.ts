import { getBehaviorSettings } from "@api/ai-pipeline/shared/settings";
import type { Database } from "@api/db";
import { getAiAgentById } from "@api/db/queries/ai-agent";
import type { AiAgentToolId } from "@cossistant/types";
import { logAiPipeline } from "../logger";
import {
	loadConversationSeed,
	loadIntakeContext,
} from "../primary-pipeline/steps/intake/load-context";
import { resolveAndPersistModel } from "../primary-pipeline/steps/intake/model-resolution";
import {
	type GenerationRuntimeResult,
	runGenerationRuntime,
} from "../shared/generation";

export type BackgroundPipelineInput = {
	conversationId: string;
	websiteId: string;
	organizationId: string;
	aiAgentId: string;
	sourceMessageId: string;
	sourceMessageCreatedAt: string;
	workflowRunId: string;
	jobId: string;
};

export type BackgroundPipelineResult = {
	status: "completed" | "skipped" | "error";
	reason?: string;
	error?: string;
	metrics: {
		intakeMs: number;
		analysisMs: number;
		executionMs: number;
		totalMs: number;
	};
};

type BackgroundPipelineContext = {
	db: Database;
	input: BackgroundPipelineInput;
};

const BACKGROUND_TOOL_IDS: AiAgentToolId[] = [
	"updateConversationTitle",
	"updateSentiment",
	"setPriority",
	"skip",
];

function getBackgroundToolAllowlist(
	aiAgent: Awaited<ReturnType<typeof getAiAgentById>>
): AiAgentToolId[] {
	if (!aiAgent) {
		return ["skip"];
	}

	const settings = getBehaviorSettings(aiAgent);
	const allowlist: AiAgentToolId[] = [];

	if (settings.autoGenerateTitle) {
		allowlist.push("updateConversationTitle");
	}

	if (settings.autoAnalyzeSentiment) {
		allowlist.push("updateSentiment");
	}

	if (settings.canSetPriority) {
		allowlist.push("setPriority");
	}

	allowlist.push("skip");
	return allowlist;
}

function hasBackgroundAnalysisWork(
	toolAllowlist: readonly AiAgentToolId[]
): boolean {
	return toolAllowlist.some((toolId) => toolId !== "skip");
}

function hasBackgroundMutation(result: GenerationRuntimeResult): boolean {
	return BACKGROUND_TOOL_IDS.some((toolId) => {
		if (toolId === "skip") {
			return false;
		}

		return (result.toolCallsByName[toolId] ?? 0) > 0;
	});
}

async function runBackgroundIntake(ctx: BackgroundPipelineContext): Promise<
	| {
			status: "ready";
			aiAgent: NonNullable<Awaited<ReturnType<typeof getAiAgentById>>>;
			toolAllowlist: AiAgentToolId[];
			modelResolution: Awaited<
				ReturnType<typeof resolveAndPersistModel>
			>["modelResolution"];
			conversation: NonNullable<
				Awaited<ReturnType<typeof loadConversationSeed>>["conversation"]
			>;
			conversationHistory: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["conversationHistory"];
			visitorContext: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["visitorContext"];
			conversationState: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["conversationState"];
			triggerMessage: Awaited<
				ReturnType<typeof loadIntakeContext>
			>["triggerMessage"];
	  }
	| {
			status: "skipped";
			reason: string;
	  }
> {
	const aiAgent = await getAiAgentById(ctx.db, {
		aiAgentId: ctx.input.aiAgentId,
	});
	if (!aiAgent?.isActive) {
		return {
			status: "skipped",
			reason: "Background analysis requires an active AI agent",
		};
	}

	const toolAllowlist = getBackgroundToolAllowlist(aiAgent);
	if (!hasBackgroundAnalysisWork(toolAllowlist)) {
		return {
			status: "skipped",
			reason: "No background analysis capabilities enabled",
		};
	}

	const { aiAgent: resolvedAiAgent, modelResolution } =
		await resolveAndPersistModel({
			db: ctx.db,
			aiAgent,
			conversationId: ctx.input.conversationId,
		});

	const { conversation, triggerMetadata } = await loadConversationSeed(ctx.db, {
		conversationId: ctx.input.conversationId,
		messageId: ctx.input.sourceMessageId,
		organizationId: ctx.input.organizationId,
	});

	if (!conversation) {
		return {
			status: "skipped",
			reason: `Conversation ${ctx.input.conversationId} not found`,
		};
	}

	if (!triggerMetadata) {
		return {
			status: "skipped",
			reason: `Source message ${ctx.input.sourceMessageId} not found`,
		};
	}

	if (triggerMetadata.conversationId !== ctx.input.conversationId) {
		return {
			status: "skipped",
			reason: `Source message ${ctx.input.sourceMessageId} does not belong to conversation ${ctx.input.conversationId}`,
		};
	}

	const intakeContext = await loadIntakeContext(ctx.db, {
		conversationId: ctx.input.conversationId,
		organizationId: ctx.input.organizationId,
		websiteId: ctx.input.websiteId,
		visitorId: conversation.visitorId,
		conversation,
		triggerMetadata,
	});

	return {
		status: "ready",
		aiAgent: resolvedAiAgent,
		toolAllowlist,
		modelResolution,
		conversation,
		conversationHistory: intakeContext.conversationHistory,
		visitorContext: intakeContext.visitorContext,
		conversationState: intakeContext.conversationState,
		triggerMessage: intakeContext.triggerMessage,
	};
}

/**
 * Background pipeline shell.
 * Scheduling and queue orchestration are implemented first; triage actions will be added later.
 */
export async function runBackgroundPipeline(
	ctx: BackgroundPipelineContext
): Promise<BackgroundPipelineResult> {
	const startTime = Date.now();
	const { conversationId, workflowRunId, jobId } = ctx.input;
	let intakeMs = 0;
	let analysisMs = 0;

	try {
		logAiPipeline({
			area: "background",
			event: "start",
			conversationId,
			fields: {
				workflowRunId,
				jobId,
				sourceMessageId: ctx.input.sourceMessageId,
			},
		});

		const intakeStartedAt = Date.now();
		const intakeResult = await runBackgroundIntake(ctx);
		intakeMs = Date.now() - intakeStartedAt;

		if (intakeResult.status !== "ready") {
			logAiPipeline({
				area: "background",
				event: "skip",
				conversationId,
				fields: {
					reason: intakeResult.reason,
				},
			});

			return {
				status: "skipped",
				reason: intakeResult.reason,
				metrics: {
					intakeMs,
					analysisMs,
					executionMs: 0,
					totalMs: Date.now() - startTime,
				},
			};
		}

		const analysisStartedAt = Date.now();
		const generationResult = await runGenerationRuntime({
			db: ctx.db,
			pipelineKind: "background",
			mode: "background_only",
			aiAgent: intakeResult.aiAgent,
			conversation: intakeResult.conversation,
			conversationHistory: intakeResult.conversationHistory,
			visitorContext: intakeResult.visitorContext,
			conversationState: intakeResult.conversationState,
			humanCommand: null,
			workflowRunId,
			triggerMessageId: ctx.input.sourceMessageId,
			triggerMessageCreatedAt: ctx.input.sourceMessageCreatedAt,
			triggerSenderType: intakeResult.triggerMessage?.senderType,
			triggerVisibility: intakeResult.triggerMessage?.visibility,
			allowPublicMessages: false,
			toolAllowlist: intakeResult.toolAllowlist,
		});
		analysisMs = Date.now() - analysisStartedAt;

		if (generationResult.status === "error") {
			const errorMessage =
				generationResult.error ?? "Background analysis failed";
			logAiPipeline({
				area: "background",
				event: "error",
				level: "error",
				conversationId,
				fields: {
					message: errorMessage,
					failureCode: generationResult.failureCode,
				},
			});

			return {
				status: "error",
				error: errorMessage,
				metrics: {
					intakeMs,
					analysisMs,
					executionMs: 0,
					totalMs: Date.now() - startTime,
				},
			};
		}

		if (!hasBackgroundMutation(generationResult)) {
			logAiPipeline({
				area: "background",
				event: "skip",
				conversationId,
				fields: {
					reason: generationResult.action.reasoning,
				},
			});

			return {
				status: "skipped",
				reason: generationResult.action.reasoning,
				metrics: {
					intakeMs,
					analysisMs,
					executionMs: 0,
					totalMs: Date.now() - startTime,
				},
			};
		}

		logAiPipeline({
			area: "background",
			event: "completed",
			conversationId,
			fields: {
				workflowRunId,
				jobId,
				sourceMessageId: ctx.input.sourceMessageId,
				toolCalls: generationResult.totalToolCalls,
			},
		});

		return {
			status: "completed",
			metrics: {
				intakeMs,
				analysisMs,
				executionMs: 0,
				totalMs: Date.now() - startTime,
			},
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Background pipeline failed";

		logAiPipeline({
			area: "background",
			event: "error",
			level: "error",
			conversationId,
			fields: {
				message,
			},
			error,
		});

		return {
			status: "error",
			error: message,
			metrics: {
				intakeMs,
				analysisMs,
				executionMs: 0,
				totalMs: Date.now() - startTime,
			},
		};
	}
}
