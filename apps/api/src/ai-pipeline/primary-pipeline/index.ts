import { env } from "@api/env";
import { logAiPipeline } from "../logger";
import { createPipelineDevConversationLog } from "../shared/dev-conversation-log";
import type {
	PrimaryPipelineContext,
	PrimaryPipelineResult,
} from "./contracts";
import { emitPipelineSeenSafe } from "./internal/seen";
import { resolveTracePayloadMode } from "./internal/trace";
import {
	createPrimaryTypingControls,
	startPrimaryTypingSafely,
} from "./internal/typing";
import { trackPrimaryGenerationUsage } from "./internal/usage";
import { runDecisionStep } from "./steps/decision";
import { runPrimaryGenerationStep } from "./steps/generation";
import { runIntakeStep } from "./steps/intake";
import {
	buildCompletedResult,
	buildErrorResult,
	buildSkippedResult,
} from "./utils/pipeline-result";
import { createStageMetrics, measureStage } from "./utils/stage-metrics";

export type {
	CapturedFinalAction,
	GenerationMode,
	GenerationRuntimeInput,
	GenerationRuntimeResult as SharedGenerationRuntimeResult,
	GenerationTokenUsage,
	PipelineKind,
} from "../shared/generation/contracts";
export type {
	PipelineToolContext,
	PipelineToolResult,
	ToolRuntimeState,
} from "../shared/tools/contracts";
export type {
	GenerationCreditUsage,
	GenerationUsageTrackingResult,
} from "../shared/usage";
export type {
	ConversationState,
	ModelResolution,
	PrimaryPipelineContext,
	PrimaryPipelineInput,
	PrimaryPipelineMetrics,
	PrimaryPipelineResult,
	RoleAwareMessage,
	SenderType,
	VisitorContext,
} from "./contracts";
export type { DecisionResult, ResponseMode } from "./steps/decision";
export type { SmartDecisionResult } from "./steps/decision/smart";
export type { GenerationRuntimeResult } from "./steps/generation";
export { runPrimaryGenerationStep } from "./steps/generation";
export type {
	IntakeReadyContext,
	IntakeStepResult,
} from "./steps/intake/types";

export async function runPrimaryPipeline(
	ctx: PrimaryPipelineContext
): Promise<PrimaryPipelineResult> {
	const pipelineStartedAt = Date.now();
	const metrics = createStageMetrics();
	const conversationLog = createPipelineDevConversationLog(
		ctx.input.conversationId
	);
	const deepTraceEnabled = env.AI_AGENT_DEEP_TRACE_ENABLED === true;
	const tracePayloadMode = resolveTracePayloadMode(
		env.AI_AGENT_TRACE_PAYLOAD_MODE
	);

	logAiPipeline({
		area: "primary",
		event: "start",
		conversationId: ctx.input.conversationId,
		fields: {
			trigger: ctx.input.messageId,
			workflowRunId: ctx.input.workflowRunId,
			jobId: ctx.input.jobId,
		},
	});
	conversationLog.log(
		`[ai-pipeline:primary] conv=${ctx.input.conversationId} workflowRunId=${ctx.input.workflowRunId} evt=start trigger=${ctx.input.messageId}`
	);

	try {
		const intakeResult = await measureStage(metrics, "intakeMs", () =>
			runIntakeStep({
				db: ctx.db,
				input: ctx.input,
			})
		);

		if (intakeResult.status !== "ready") {
			logAiPipeline({
				area: "primary",
				event: "skip",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "intake",
					reason: intakeResult.reason,
				},
			});

			return buildSkippedResult({
				metrics,
				pipelineStartedAt,
				reason: intakeResult.reason,
				action: "intake_skipped",
			});
		}

		await emitPipelineSeenSafe({
			db: ctx.db,
			conversation: intakeResult.data.conversation,
			aiAgentId: intakeResult.data.aiAgent.id,
			conversationId: ctx.input.conversationId,
		});

		const decisionResult = await measureStage(metrics, "decisionMs", () =>
			runDecisionStep({
				db: ctx.db,
				input: intakeResult.data,
			})
		);

		if (!decisionResult.shouldAct) {
			logAiPipeline({
				area: "primary",
				event: "skip",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "decision",
					mode: decisionResult.mode,
					reason: decisionResult.reason,
				},
			});

			return buildSkippedResult({
				metrics,
				pipelineStartedAt,
				reason: decisionResult.reason,
				action: "decision_skipped",
			});
		}

		const allowPublicMessages = decisionResult.mode !== "background_only";
		const typingControls = createPrimaryTypingControls({
			allowPublicMessages,
			conversation: intakeResult.data.conversation,
			aiAgentId: intakeResult.data.aiAgent.id,
			conversationId: ctx.input.conversationId,
		});

		await startPrimaryTypingSafely({
			conversationId: ctx.input.conversationId,
			controls: typingControls,
		});

		const generationResult = await (async () => {
			try {
				return await measureStage(metrics, "generationMs", () =>
					runPrimaryGenerationStep({
						db: ctx.db,
						pipelineInput: ctx.input,
						intake: intakeResult.data,
						decision: decisionResult,
						startTyping: typingControls.startTyping,
						stopTyping: typingControls.stopTyping,
						debugLogger: conversationLog,
						deepTraceEnabled,
						tracePayloadMode,
					})
				);
			} finally {
				await typingControls.stopSafely();
			}
		})();

		let usageTelemetry:
			| {
					usageTokens: PrimaryPipelineResult["usageTokens"];
					creditUsage: PrimaryPipelineResult["creditUsage"];
			  }
			| undefined;

		usageTelemetry = await trackPrimaryGenerationUsage({
			db: ctx.db,
			organizationId: ctx.input.organizationId,
			websiteId: ctx.input.websiteId,
			conversationId: ctx.input.conversationId,
			visitorId: ctx.input.visitorId,
			workflowRunId: ctx.input.workflowRunId,
			triggerMessageId: ctx.input.messageId,
			intake: intakeResult.data,
			generationResult,
		});

		if (generationResult.status === "error") {
			const errorMessage =
				generationResult.error ?? "Generation step failed unexpectedly";
			const retryable = generationResult.publicMessagesSent === 0;
			logAiPipeline({
				area: "primary",
				event: "generation_error",
				level: "error",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "generation",
					retryable,
					failureCode: generationResult.failureCode,
					attempts: generationResult.attempts?.length,
					message: errorMessage,
				},
			});

			return buildErrorResult({
				metrics,
				pipelineStartedAt,
				error: errorMessage,
				retryable,
				action: "generation_error",
				publicMessagesSent: generationResult.publicMessagesSent,
				usageTokens: usageTelemetry?.usageTokens,
				creditUsage: usageTelemetry?.creditUsage,
			});
		}

		if (generationResult.action.action === "skip") {
			logAiPipeline({
				area: "primary",
				event: "skip",
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "generation",
					reason: generationResult.action.reasoning,
				},
			});

			return buildSkippedResult({
				metrics,
				pipelineStartedAt,
				reason: generationResult.action.reasoning,
				action: "skip",
				publicMessagesSent: generationResult.publicMessagesSent,
				usageTokens: usageTelemetry?.usageTokens,
				creditUsage: usageTelemetry?.creditUsage,
			});
		}

		logAiPipeline({
			area: "primary",
			event: "completed",
			conversationId: ctx.input.conversationId,
			fields: {
				stage: "generation",
				action: generationResult.action.action,
				publicMessages: generationResult.publicMessagesSent,
			},
		});

		return buildCompletedResult({
			metrics,
			pipelineStartedAt,
			action: generationResult.action.action,
			reason: generationResult.action.reasoning,
			publicMessagesSent: generationResult.publicMessagesSent,
			usageTokens: usageTelemetry?.usageTokens,
			creditUsage: usageTelemetry?.creditUsage,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown pipeline error";

		logAiPipeline({
			area: "primary",
			event: "error",
			level: "error",
			conversationId: ctx.input.conversationId,
			fields: {
				message,
			},
			error,
		});

		return buildErrorResult({
			metrics,
			pipelineStartedAt,
			error: message,
			retryable: true,
			action: "primary_error",
		});
	} finally {
		if (deepTraceEnabled) {
			conversationLog.log(
				`[ai-pipeline:primary] conv=${ctx.input.conversationId} workflowRunId=${ctx.input.workflowRunId} evt=end durationMs=${Date.now() - pipelineStartedAt}`
			);
		}
		await conversationLog.flush();
	}
}
