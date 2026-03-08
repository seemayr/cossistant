import { env } from "@api/env";
import { logAiPipeline } from "../logger";
import { createPipelineDevConversationLog } from "../shared/dev-conversation-log";
import {
	type GenerationRuntimeInput,
	runGenerationRuntime,
} from "../shared/generation";
import type { ToolTracePayloadMode } from "../shared/tools/contracts";
import type {
	PrimaryPipelineContext,
	PrimaryPipelineResult,
} from "./contracts";
import { emitPipelineSeenSafe } from "./internal/seen";
import { resolveTracePayloadMode } from "./internal/trace";
import {
	createPrimaryTypingControls,
	type PrimaryTypingControls,
	startPrimaryTypingSafely,
} from "./internal/typing";
import { trackPrimaryGenerationUsage } from "./internal/usage";
import type { DecisionResult } from "./steps/decision";
import { runDecisionStep } from "./steps/decision";
import { runIntakeStep } from "./steps/intake";
import type { IntakeReadyContext } from "./steps/intake/types";
import { buildPrimaryPipelineResult } from "./utils/pipeline-result";
import { createStageMetrics, measureStage } from "./utils/stage-metrics";

function buildGenerationRuntimeInput(params: {
	ctx: PrimaryPipelineContext;
	intake: IntakeReadyContext;
	decision: DecisionResult;
	typingControls: PrimaryTypingControls;
	debugLogger: ReturnType<typeof createPipelineDevConversationLog>;
	deepTraceEnabled: boolean;
	tracePayloadMode: ToolTracePayloadMode;
}): GenerationRuntimeInput {
	const { ctx, intake, decision, typingControls } = params;
	const trigger = intake.triggerMessage;

	return {
		db: ctx.db,
		pipelineKind: "primary",
		mode: decision.mode,
		aiAgent: intake.aiAgent,
		conversation: intake.conversation,
		conversationHistory: intake.conversationHistory,
		visitorContext: intake.visitorContext,
		conversationState: intake.conversationState,
		continuationContext: intake.continuationContext,
		humanCommand: decision.humanCommand,
		workflowRunId: ctx.input.workflowRunId,
		triggerMessageId: ctx.input.messageId,
		triggerMessageCreatedAt: ctx.input.messageCreatedAt,
		triggerSenderType: trigger?.senderType,
		triggerVisibility: trigger?.visibility,
		allowPublicMessages: decision.mode !== "background_only",
		stopTyping: typingControls.stopTyping,
		debugLogger: params.debugLogger,
		deepTraceEnabled: params.deepTraceEnabled,
		tracePayloadMode: params.tracePayloadMode,
	};
}

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
			const retryable = intakeResult.cursorDisposition === "retry";
			logAiPipeline({
				area: "primary",
				event: retryable ? "intake_retry" : "skip",
				level: retryable ? "warn" : undefined,
				conversationId: ctx.input.conversationId,
				fields: {
					stage: "intake",
					reason: intakeResult.reason,
				},
			});

			if (retryable) {
				return buildPrimaryPipelineResult({
					status: "error",
					metrics,
					pipelineStartedAt,
					cursorDisposition: intakeResult.cursorDisposition,
					error: intakeResult.reason,
					retryable: true,
					action: "intake_skipped",
				});
			}

			return buildPrimaryPipelineResult({
				status: "skipped",
				metrics,
				pipelineStartedAt,
				cursorDisposition: intakeResult.cursorDisposition,
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

			return buildPrimaryPipelineResult({
				status: "skipped",
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
					runGenerationRuntime(
						buildGenerationRuntimeInput({
							ctx,
							intake: intakeResult.data,
							decision: decisionResult,
							typingControls,
							debugLogger: conversationLog,
							deepTraceEnabled,
							tracePayloadMode,
						})
					)
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

			return buildPrimaryPipelineResult({
				status: "error",
				metrics,
				pipelineStartedAt,
				error: errorMessage,
				retryable,
				cursorDisposition: retryable ? "retry" : "advance",
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

			return buildPrimaryPipelineResult({
				status: "skipped",
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

		return buildPrimaryPipelineResult({
			status: "completed",
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

		return buildPrimaryPipelineResult({
			status: "error",
			metrics,
			pipelineStartedAt,
			error: message,
			retryable: true,
			cursorDisposition: "retry",
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
