/**
 * AI Agent Pipeline Orchestrator
 *
 * This module orchestrates the 5-step AI agent processing pipeline.
 * Each step is isolated and can be tested independently.
 *
 * Pipeline Steps:
 * 1. Intake - Gather context, validate agent is active
 * 2. Decision - Determine if/how AI should respond
 * 3. Generation - Generate response using LLM with structured output
 * 4. Execution - Execute chosen actions (DB writes)
 * 5. Followup - Post-processing, cleanup, emit events
 */

import type { Database } from "@api/db";
import { env } from "@api/env";
import {
	calculateAiCreditCharge,
	getMinimumAiCreditCharge,
} from "@api/lib/ai-credits/config";
import {
	type AiCreditGuardResult,
	guardAiCreditRun,
} from "@api/lib/ai-credits/guard";
import {
	type IngestAiCreditUsageStatus,
	ingestAiCreditUsage,
} from "@api/lib/ai-credits/polar-meter";
import { logAiCreditUsageTimeline } from "@api/lib/ai-credits/timeline";
import { generateVisitorName } from "@cossistant/core";
import { sendMessage } from "../actions/send-message";
import {
	emitDecisionMade,
	emitSeen,
	emitWorkflowCompleted,
	TypingHeartbeat,
} from "../events";
import { resolvePromptBundle } from "../prompts/resolver";
import { PROMPT_TEMPLATES } from "../prompts/templates";
import { logDecisionTimelineState } from "../tools/tool-call-logger";
import { type IntakeResult, intake } from "./1-intake";
import {
	type ContinuationHint,
	continuationGate,
} from "./1b-continuation-gate";
import { type DecisionResult, decide } from "./2-decision";
import { type GenerationResult, generate } from "./3-generation";
import { type ExecutionResult, execute } from "./4-execution";
import { followup } from "./5-followup";
import { createDevConversationLog } from "./dev-conversation-log";
import { logAiSkillUsageTimeline } from "./skill-usage-timeline";
import {
	createToolTraceDiagnostics,
	formatToolTraceDiagnostics,
	getToolTracePayloadMode,
	isDeepTraceEnabled,
	setToolTraceAbortReason,
	setToolTracePhase,
} from "./trace";

export type AiAgentPipelineInput = {
	conversationId: string;
	messageId: string;
	messageCreatedAt: string;
	websiteId: string;
	organizationId: string;
	visitorId: string;
	aiAgentId: string;
	workflowRunId: string;
	jobId: string;
};

export type AiAgentPipelineResult = {
	status: "completed" | "skipped" | "error";
	action?: string;
	reason?: string;
	error?: string;
	publicMessagesSent: number;
	retryable: boolean;
	metrics: {
		intakeMs: number;
		decisionMs: number;
		generationMs: number;
		executionMs: number;
		followupMs: number;
		totalMs: number;
	};
};

type PipelineContext = {
	db: Database;
	input: AiAgentPipelineInput;
};

const GENERATION_TIMEOUT_MS = 45_000;
const REQUIRED_MESSAGE_ACTIONS = new Set(["respond", "escalate", "resolve"]);

type PipelineMetrics = AiAgentPipelineResult["metrics"];
type ReadyIntakeResult = Extract<IntakeResult, { status: "ready" }>;
type ConversationLog = ReturnType<typeof createDevConversationLog>;
type TraceLevel = "log" | "warn" | "error";
type TraceLogFn = (
	level: TraceLevel,
	event: string,
	fields?: string,
	payload?: unknown
) => void;
type RunTracedStageFn = <T>(
	stageName: string,
	run: () => Promise<T>
) => Promise<T>;

type DecisionPolicyResolution = {
	policy: string;
	fallback: "none" | "missing" | "error";
	error?: unknown;
};

/**
 * Run the AI agent pipeline
 *
 * This is the main entry point called by the BullMQ worker.
 * It orchestrates all 5 steps and handles errors gracefully.
 */
export async function runAiAgentPipeline(
	ctx: PipelineContext
): Promise<AiAgentPipelineResult> {
	const startTime = Date.now();
	const convId = ctx.input.conversationId;
	const conversationLog = createDevConversationLog(convId);
	const metrics = createInitialMetrics();

	conversationLog.log(
		`[ai-agent] conv=${convId} | Starting pipeline | trigger=${ctx.input.messageId}`
	);

	let intakeResult: IntakeResult | null = null;
	let generationResult: GenerationResult | null = null;
	let executionResult: ExecutionResult | null = null;
	let typingHeartbeat: TypingHeartbeat | null = null;
	let willSendVisibleMessages = false;
	let typingLifecycleClosed = false;
	let typingTransitionChain: Promise<void> = Promise.resolve();
	let publicMessagesSent = 0;
	let continuationHint: ContinuationHint | undefined;
	let aiCreditGuardResult: AiCreditGuardResult | null = null;
	const publicMessageIds = new Set<string>();
	const traceContext = `conv=${convId} | workflowRunId=${ctx.input.workflowRunId} | jobId=${ctx.input.jobId} | triggerMessageId=${ctx.input.messageId}`;
	const deepTraceEnabled = isDeepTraceEnabled(env.AI_AGENT_DEEP_TRACE_ENABLED);
	const generationTraceDiagnostics =
		createToolTraceDiagnostics("pipeline_ready");
	const tracePayloadMode = getToolTracePayloadMode(
		env.AI_AGENT_TRACE_PAYLOAD_MODE
	);
	const heartbeatIntervalMs = Math.max(250, env.AI_AGENT_TRACE_HEARTBEAT_MS);

	const queueTypingTransition = async (
		run: () => Promise<void>
	): Promise<void> => {
		const queued = typingTransitionChain.then(run, run);
		typingTransitionChain = queued.then(
			() => {},
			() => {}
		);
		await queued;
	};

	const markPublicMessageSent = (params: {
		messageId: string;
		created: boolean;
		duplicateSuppressed?: boolean;
	}) => {
		if (!params.messageId) {
			return;
		}
		if (publicMessageIds.has(params.messageId)) {
			return;
		}
		publicMessageIds.add(params.messageId);
		publicMessagesSent++;
	};

	const traceLog = (
		level: "log" | "warn" | "error",
		event: string,
		fields?: string,
		payload?: unknown
	): void => {
		if (!deepTraceEnabled) {
			return;
		}
		const message = `[ai-agent:trace] ${traceContext} | ${event}${fields ? ` | ${fields}` : ""}`;
		const args = payload === undefined ? [message] : [message, payload];
		if (level === "warn") {
			conversationLog.warn(...args);
			return;
		}
		if (level === "error") {
			conversationLog.error(...args);
			return;
		}
		conversationLog.log(...args);
	};

	const traceLogger = deepTraceEnabled
		? {
				log: (...args: unknown[]) => conversationLog.log(...args),
				warn: (...args: unknown[]) => conversationLog.warn(...args),
				error: (...args: unknown[]) => conversationLog.error(...args),
			}
		: undefined;

	const runTracedStage = async <T>(
		stageName: string,
		run: () => Promise<T>
	): Promise<T> => {
		const stageStart = Date.now();
		traceLog("log", "stage.start", `stage=${stageName}`);
		try {
			const result = await run();
			traceLog(
				"log",
				"stage.end",
				`stage=${stageName} | durationMs=${Date.now() - stageStart}`
			);
			return result;
		} catch (error) {
			traceLog(
				"error",
				"stage.error",
				`stage=${stageName} | durationMs=${Date.now() - stageStart}`,
				error
			);
			throw error;
		}
	};

	const safeEmitDecisionMade = createSafeEmitter({
		stageName: "emit_decision_made",
		failureMessage: `[ai-agent] conv=${convId} | Failed to emit decision event`,
		runTracedStage,
		conversationLog,
		emitter: emitDecisionMade,
	});

	const safeEmitWorkflowCompleted = createSafeEmitter({
		stageName: "emit_workflow_completed",
		failureMessage: `[ai-agent] conv=${convId} | Failed to emit workflow completed event`,
		runTracedStage,
		conversationLog,
		emitter: emitWorkflowCompleted,
	});

	const safeEmitSeen = createSafeEmitter({
		stageName: "emit_seen",
		failureMessage: `[ai-agent] conv=${convId} | Failed to emit seen event`,
		runTracedStage,
		conversationLog,
		emitter: emitSeen,
	});

	traceLog("log", "pipeline.start");

	try {
		// Step 1: Intake - Gather context and validate
		const intakeStart = Date.now();
		intakeResult = await runTracedStage("intake", async () =>
			intake(ctx.db, ctx.input)
		);
		metrics.intakeMs = Date.now() - intakeStart;

		if (intakeResult.status !== "ready") {
			conversationLog.log(
				`[ai-agent] conv=${convId} | Skipped at intake | reason="${intakeResult.reason}"`
			);
			return createSkippedResult({
				reason: intakeResult.reason,
				publicMessagesSent,
				metrics,
				startTime,
			});
		}
		const readyIntake = intakeResult;
		const shouldEmitAiSeen =
			readyIntake.triggerMessage?.senderType === "visitor" &&
			readyIntake.triggerMessage.visibility === "public";
		if (shouldEmitAiSeen) {
			await safeEmitSeen({
				db: ctx.db,
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
			});
		}
		const resolvedModelId = readyIntake.modelResolution.modelIdResolved;
		const modelIdOriginal = readyIntake.modelResolution.modelIdOriginal;
		const modelMigrationApplied =
			readyIntake.modelResolution.modelMigrationApplied;
		const decisionPolicyPromise = resolveDecisionPolicyWithFallback({
			db: ctx.db,
			aiAgent: readyIntake.aiAgent,
			traceLog,
		});

		const continuationResult = await runTracedStage(
			"continuation_gate",
			async () =>
				continuationGate({
					db: ctx.db,
					conversationId: ctx.input.conversationId,
					organizationId: ctx.input.organizationId,
					triggerMessageId: ctx.input.messageId,
					triggerMessageCreatedAt: ctx.input.messageCreatedAt,
					triggerMessage: readyIntake.triggerMessage,
					conversationHistory: readyIntake.conversationHistory,
				})
		);
		conversationLog.log(
			`[ai-agent] conv=${convId} | continuationDecision=${continuationResult.decision} | continuationConfidence=${continuationResult.confidence} | continuationReason=${continuationResult.reason}`
		);

		if (continuationResult.decision === "skip") {
			const skipReason = `Continuation gate skipped trigger: ${continuationResult.reason}`;

			await safeEmitDecisionMade({
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				shouldAct: false,
				reason: skipReason,
				mode: "background_only",
			});

			await safeEmitWorkflowCompleted({
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				status: "skipped",
				reason: skipReason,
			});

			return createSkippedResult({
				reason: skipReason,
				publicMessagesSent,
				metrics,
				startTime,
			});
		}

		continuationHint = createContinuationHint(continuationResult);

		// Step 2: Decision - Should AI act?
		const decisionStart = Date.now();
		const decisionToolContext = {
			db: ctx.db,
			conversationId: ctx.input.conversationId,
			organizationId: ctx.input.organizationId,
			websiteId: ctx.input.websiteId,
			visitorId: ctx.input.visitorId,
			aiAgentId: readyIntake.aiAgent.id,
			triggerMessageId: ctx.input.messageId,
			workflowRunId: ctx.input.workflowRunId,
			triggerVisibility: readyIntake.triggerMessage?.visibility,
		} as const;

		await logDecisionTimelineState({
			toolContext: decisionToolContext,
			state: "partial",
		});

		const readyDecision = await runTracedStage("decision", async () => {
			try {
				const decisionPolicyResolution = await decisionPolicyPromise;
				if (decisionPolicyResolution.fallback === "error") {
					conversationLog.warn(
						`[ai-agent] conv=${convId} | Failed to resolve decision.md, using fallback policy`,
						decisionPolicyResolution.error
					);
				}
				const decisionPolicy = decisionPolicyResolution.policy;

				const resolvedDecision = await decide({
					aiAgent: readyIntake.aiAgent,
					conversation: readyIntake.conversation,
					conversationHistory: readyIntake.conversationHistory,
					conversationState: readyIntake.conversationState,
					triggerMessage: readyIntake.triggerMessage,
					decisionPolicy,
				});

				await logDecisionTimelineState({
					toolContext: decisionToolContext,
					state: "result",
					result: {
						shouldAct: resolvedDecision.shouldAct,
						mode: resolvedDecision.mode,
						reason: resolvedDecision.reason,
					},
				});
				return resolvedDecision;
			} catch (error) {
				await logDecisionTimelineState({
					toolContext: decisionToolContext,
					state: "error",
					error,
				});
				throw error;
			}
		});
		metrics.decisionMs = Date.now() - decisionStart;

		// Emit decision event
		if (!readyDecision.shouldAct) {
			await safeEmitDecisionMade({
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				shouldAct: false,
				reason: readyDecision.reason,
				mode: readyDecision.mode,
			});

			conversationLog.log(
				`[ai-agent] conv=${convId} | Skipped at decision | reason="${readyDecision.reason}"`
			);

			// Emit completion event (dashboard only since shouldAct=false)
			await safeEmitWorkflowCompleted({
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				status: "skipped",
				reason: readyDecision.reason,
			});

			return createSkippedResult({
				reason: readyDecision.reason,
				publicMessagesSent,
				metrics,
				startTime,
			});
		}

		const [, guardResult] = await runTracedStage("credit_guard", async () =>
			Promise.all([
				safeEmitDecisionMade({
					conversation: readyIntake.conversation,
					aiAgentId: readyIntake.aiAgent.id,
					workflowRunId: ctx.input.workflowRunId,
					shouldAct: true,
					reason: readyDecision.reason,
					mode: readyDecision.mode,
				}),
				guardAiCreditRun({
					organizationId: ctx.input.organizationId,
					modelId: resolvedModelId,
				}),
			])
		);
		aiCreditGuardResult = guardResult;

		if (!aiCreditGuardResult.allowed) {
			const blockedReason = `AI credit guard blocked run: ${aiCreditGuardResult.reason}`;
			await logBlockedAiCreditUsage({
				ctx,
				intake: readyIntake,
				guardResult: aiCreditGuardResult,
				resolvedModelId,
				modelIdOriginal,
				modelMigrationApplied,
				conversationLog,
				convId,
			});

			await safeEmitWorkflowCompleted({
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				status: "skipped",
				reason: blockedReason,
			});

			return createSkippedResult({
				reason: blockedReason,
				publicMessagesSent,
				metrics,
				startTime,
			});
		}

		// Only start typing if AI may send visible visitor messages.
		// background_only = private/internal only.
		// respond_to_command may still send visitor messages even for private team triggers.
		// This prevents "phantom typing" when AI observes but doesn't respond.
		const allowPublicMessages = shouldAllowPublicMessages({
			mode: readyDecision.mode,
			triggerVisibility: readyIntake.triggerMessage?.visibility,
		});
		willSendVisibleMessages = allowPublicMessages;

		// Callback to stop typing - passed to tools
		// Stops typing after the current message resolves.
		const stopTyping = async (): Promise<void> => {
			await queueTypingTransition(async () => {
				if (typingLifecycleClosed || !willSendVisibleMessages) {
					return;
				}

				if (typingHeartbeat?.running) {
					conversationLog.log(
						`[ai-agent] conv=${convId} | Stopping typing via tool callback`
					);
					await typingHeartbeat.stop();
				}
			});
		};

		// Callback to start/restart typing - passed to tools
		// Used to show typing indicator during inter-message delays
		// This ensures users see "typing..." between multiple messages
		const startTyping = async (): Promise<void> => {
			await queueTypingTransition(async () => {
				// Only start typing if we should be showing typing indicators
				if (typingLifecycleClosed || !willSendVisibleMessages) {
					return;
				}

				// Never create a late heartbeat here; lifecycle ownership stays in
				// the orchestrator startup path.
				if (typingHeartbeat && !typingHeartbeat.running) {
					conversationLog.log(
						`[ai-agent] conv=${convId} | Restarting typing via tool callback`
					);
					await typingHeartbeat.start();
				}
			});
		};

		if (willSendVisibleMessages) {
			typingHeartbeat = new TypingHeartbeat({
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
			});

			conversationLog.log(
				`[ai-agent] conv=${convId} | Starting typing indicator (AI will respond)`
			);
			await queueTypingTransition(async () => {
				if (typingLifecycleClosed) {
					return;
				}
				if (typingHeartbeat && !typingHeartbeat.running) {
					await typingHeartbeat.start();
				}
			});
		} else {
			conversationLog.log(
				`[ai-agent] conv=${convId} | Skipping typing indicator (background_only mode)`
			);
		}

		const finalizeAiCreditUsage = async (
			result: GenerationResult | null
		): Promise<void> =>
			finalizeAiCreditUsageForRun({
				ctx,
				intake: readyIntake,
				guardResult: aiCreditGuardResult,
				result,
				resolvedModelId,
				modelIdOriginal,
				modelMigrationApplied,
				conversationLog,
				convId,
			});

		// Step 3: Generation - Call LLM with tools
		const generationStart = Date.now();
		const generationAbortController = new AbortController();
		let generationHeartbeat: ReturnType<typeof setInterval> | null = null;
		setToolTracePhase(generationTraceDiagnostics, "generation_waiting_model");
		if (deepTraceEnabled) {
			traceLog(
				"log",
				"generation.timeout.armed",
				`timeoutMs=${GENERATION_TIMEOUT_MS} | payloadMode=${tracePayloadMode}`
			);
			traceLog(
				"log",
				"generation.heartbeat.armed",
				`intervalMs=${heartbeatIntervalMs}`
			);
		}
		const generationTimeout = setTimeout(() => {
			setToolTraceAbortReason(generationTraceDiagnostics, "generation_timeout");
			traceLog(
				"warn",
				"generation.timeout.fired",
				`timeoutMs=${GENERATION_TIMEOUT_MS} | ${formatToolTraceDiagnostics(generationTraceDiagnostics)}`
			);
			conversationLog.warn(
				`[ai-agent] conv=${convId} | Generation timeout after ${GENERATION_TIMEOUT_MS}ms | abortReason=generation_timeout`
			);
			generationAbortController.abort();
		}, GENERATION_TIMEOUT_MS);
		if (deepTraceEnabled) {
			generationHeartbeat = setInterval(() => {
				traceLog(
					"log",
					"generation.heartbeat",
					`elapsedMs=${Date.now() - generationStart} | ${formatToolTraceDiagnostics(generationTraceDiagnostics)}`
				);
			}, heartbeatIntervalMs);
			generationHeartbeat.unref?.();
		}
		try {
			const readyGeneration = await runTracedStage("generation", async () =>
				generate({
					db: ctx.db,
					aiAgent: readyIntake.aiAgent,
					conversation: readyIntake.conversation,
					conversationHistory: readyIntake.conversationHistory,
					visitorContext: readyIntake.visitorContext,
					mode: readyDecision.mode,
					humanCommand: readyDecision.humanCommand,
					organizationId: ctx.input.organizationId,
					websiteId: ctx.input.websiteId,
					visitorId: ctx.input.visitorId,
					triggerMessageId: ctx.input.messageId,
					triggerMessageCreatedAt: ctx.input.messageCreatedAt,
					triggerSenderType: readyIntake.triggerMessage?.senderType,
					triggerVisibility: readyIntake.triggerMessage?.visibility,
					abortSignal: generationAbortController.signal,
					stopTyping, // Stop typing when final send is complete
					startTyping, // Start typing for inter-message delays
					onPublicMessageSent: markPublicMessageSent,
					allowPublicMessages,
					isEscalated: readyDecision.isEscalated, // Pass escalation context
					escalationReason: readyDecision.escalationReason,
					smartDecision: readyDecision.smartDecision, // Pass smart decision for prompt context
					continuationHint,
					workflowRunId: ctx.input.workflowRunId, // For progress events in tools
					traceDiagnostics: generationTraceDiagnostics,
					traceLogger,
					deepTraceEnabled,
					tracePayloadMode,
				})
			);
			generationResult = readyGeneration;
			if (readyGeneration.aborted) {
				traceLog(
					"warn",
					"generation.aborted",
					`abortReason=${generationTraceDiagnostics.abortReason ?? "abort_signal"} | ${formatToolTraceDiagnostics(generationTraceDiagnostics)}`
				);
			}
		} finally {
			clearTimeout(generationTimeout);
			if (generationHeartbeat) {
				clearInterval(generationHeartbeat);
			}
			metrics.generationMs = Date.now() - generationStart;
			traceLog(
				"log",
				"generation.complete",
				`durationMs=${metrics.generationMs} | ${formatToolTraceDiagnostics(generationTraceDiagnostics)}`
			);
			await finalizeAiCreditUsage(generationResult);
		}
		if (!generationResult) {
			throw new Error("Generation result missing after generation stage");
		}
		const readyGeneration = generationResult;

		const usedCustomSkills = readyGeneration.usedCustomSkills;
		if (usedCustomSkills && usedCustomSkills.length > 0) {
			try {
				await logAiSkillUsageTimeline({
					db: ctx.db,
					organizationId: ctx.input.organizationId,
					websiteId: ctx.input.websiteId,
					conversationId: ctx.input.conversationId,
					visitorId: ctx.input.visitorId,
					aiAgentId: readyIntake.aiAgent.id,
					workflowRunId: ctx.input.workflowRunId,
					triggerMessageId: ctx.input.messageId,
					triggerVisibility: readyIntake.triggerMessage?.visibility,
					usedCustomSkills,
				});
			} catch (error) {
				conversationLog.warn(
					`[ai-agent] conv=${convId} | Failed to log AI skill usage timeline`,
					error
				);
			}
		}

		await maybeSendFallbackMessage({
			ctx,
			intake: readyIntake,
			generation: readyGeneration,
			allowPublicMessages,
			publicMessagesSent,
			markPublicMessageSent,
			conversationLog,
			convId,
		});

		// Step 4: Execution - Execute actions
		const executionStart = Date.now();

		// Get visitor display name (from contact or generate a friendly name)
		const visitorName =
			readyIntake.visitorContext?.name ??
			generateVisitorName(ctx.input.visitorId);

		executionResult = await runTracedStage("execution", async () =>
			execute({
				db: ctx.db,
				aiAgent: readyIntake.aiAgent,
				conversation: readyIntake.conversation,
				decision: readyGeneration.decision,
				jobId: ctx.input.jobId,
				messageId: ctx.input.messageId,
				organizationId: ctx.input.organizationId,
				websiteId: ctx.input.websiteId,
				visitorId: ctx.input.visitorId,
				visitorName,
			})
		);
		metrics.executionMs = Date.now() - executionStart;
		// Typing already stopped after generation

		// Step 5: Followup - Cleanup and emit events
		const followupStart = Date.now();
		await runTracedStage("followup", async () =>
			followup({
				db: ctx.db,
				aiAgent: readyIntake.aiAgent,
				conversation: readyIntake.conversation,
				decision: readyGeneration.decision,
				executionResult,
			})
		);
		metrics.followupMs = Date.now() - followupStart;

		// Emit completion event (success - notify widget)
		await safeEmitWorkflowCompleted({
			conversation: readyIntake.conversation,
			aiAgentId: readyIntake.aiAgent.id,
			workflowRunId: ctx.input.workflowRunId,
			status: "success",
			action: readyGeneration.decision.action,
		});

		const finalMetrics = finalizeMetrics(metrics, startTime);
		conversationLog.log(
			`[ai-agent] conv=${convId} | Completed | action=${readyGeneration.decision.action} | total=${finalMetrics.totalMs}ms`
		);
		traceLog(
			"log",
			"pipeline.end",
			`status=completed | action=${readyGeneration.decision.action} | totalMs=${finalMetrics.totalMs}`
		);

		return createCompletedResult({
			action: readyGeneration.decision.action,
			publicMessagesSent,
			metrics: finalMetrics,
		});
	} catch (error) {
		// Run followup for cleanup (workflow state, etc.)
		if (intakeResult?.status === "ready") {
			const readyIntakeOnError = intakeResult;
			try {
				await runTracedStage("followup_error_cleanup", async () =>
					followup({
						db: ctx.db,
						aiAgent: readyIntakeOnError.aiAgent,
						conversation: readyIntakeOnError.conversation,
						decision: null,
						executionResult: null,
					})
				);
			} catch {
				// Ignore cleanup errors
			}
		}

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		conversationLog.error(
			`[ai-agent] conv=${convId} | Error | ${errorMessage}`
		);
		traceLog(
			"error",
			"pipeline.end",
			`status=error | error=${errorMessage} | retryable=${publicMessagesSent === 0}`,
			error
		);

		// Emit error completion event (dashboard only)
		if (intakeResult?.status === "ready") {
			const readyIntakeOnError = intakeResult;
			await safeEmitWorkflowCompleted({
				conversation: readyIntakeOnError.conversation,
				aiAgentId: readyIntakeOnError.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				status: "error",
				reason: errorMessage,
			});
		}

		return createErrorResult({
			error: errorMessage,
			publicMessagesSent,
			metrics,
			startTime,
		});
	} finally {
		// Single authoritative typing cleanup.
		typingLifecycleClosed = true;
		try {
			await queueTypingTransition(async () => {
				if (typingHeartbeat?.running) {
					await typingHeartbeat.stop();
				}
			});
		} catch (error) {
			conversationLog.warn(
				`[ai-agent] conv=${convId} | Failed to stop typing heartbeat in cleanup:`,
				error
			);
		}

		try {
			await conversationLog.flush();
		} catch (error) {
			console.warn(
				`[ai-agent] conv=${convId} | Failed to flush dev conversation logs`,
				error
			);
		}
	}
}

function createInitialMetrics(): PipelineMetrics {
	return {
		intakeMs: 0,
		decisionMs: 0,
		generationMs: 0,
		executionMs: 0,
		followupMs: 0,
		totalMs: 0,
	};
}

function createSkippedResult(params: {
	reason: string;
	publicMessagesSent: number;
	metrics: PipelineMetrics;
	startTime: number;
}): AiAgentPipelineResult {
	return {
		status: "skipped",
		reason: params.reason,
		publicMessagesSent: params.publicMessagesSent,
		retryable: false,
		metrics: finalizeMetrics(params.metrics, params.startTime),
	};
}

function createCompletedResult(params: {
	action: string;
	publicMessagesSent: number;
	metrics: PipelineMetrics;
}): AiAgentPipelineResult {
	return {
		status: "completed",
		action: params.action,
		publicMessagesSent: params.publicMessagesSent,
		retryable: false,
		metrics: params.metrics,
	};
}

function createErrorResult(params: {
	error: string;
	publicMessagesSent: number;
	metrics: PipelineMetrics;
	startTime: number;
}): AiAgentPipelineResult {
	return {
		status: "error",
		error: params.error,
		publicMessagesSent: params.publicMessagesSent,
		retryable: params.publicMessagesSent === 0,
		metrics: finalizeMetrics(params.metrics, params.startTime),
	};
}

function createSafeEmitter<TParams>(params: {
	stageName: string;
	failureMessage: string;
	runTracedStage: RunTracedStageFn;
	conversationLog: ConversationLog;
	emitter: (input: TParams) => Promise<void>;
}): (input: TParams) => Promise<void> {
	return async (input) => {
		try {
			await params.runTracedStage(params.stageName, async () =>
				params.emitter(input)
			);
		} catch (error) {
			params.conversationLog.warn(params.failureMessage, error);
		}
	};
}

function resolveDecisionPolicyWithFallback(params: {
	db: Database;
	aiAgent: ReadyIntakeResult["aiAgent"];
	traceLog: TraceLogFn;
}): Promise<DecisionPolicyResolution> {
	const decisionPolicyStart = Date.now();
	params.traceLog("log", "stage.start", "stage=decision_policy_resolution");
	return resolvePromptBundle({
		db: params.db,
		aiAgent: params.aiAgent,
		mode: "background_only",
	})
		.then((bundle) => {
			const policy = bundle.coreDocuments["decision.md"]?.content?.trim();
			if (!policy) {
				params.traceLog(
					"warn",
					"stage.end",
					`stage=decision_policy_resolution | durationMs=${Date.now() - decisionPolicyStart} | fallback=missing`
				);
				return {
					policy: PROMPT_TEMPLATES.DECISION_POLICY,
					fallback: "missing",
				} as const;
			}
			params.traceLog(
				"log",
				"stage.end",
				`stage=decision_policy_resolution | durationMs=${Date.now() - decisionPolicyStart} | fallback=none`
			);
			return { policy, fallback: "none" } as const;
		})
		.catch((error) => {
			params.traceLog(
				"warn",
				"stage.error",
				`stage=decision_policy_resolution | durationMs=${Date.now() - decisionPolicyStart} | fallback=error`,
				error
			);
			return {
				policy: PROMPT_TEMPLATES.DECISION_POLICY,
				fallback: "error",
				error,
			} as const;
		});
}

function createContinuationHint(
	continuationResult: Awaited<ReturnType<typeof continuationGate>>
): ContinuationHint | undefined {
	if (continuationResult.decision !== "supplement") {
		return;
	}
	return {
		reason: continuationResult.reason,
		confidence: continuationResult.confidence,
		deltaHint: continuationResult.deltaHint,
		latestAiMessageId: continuationResult.latestAiMessageId ?? "",
		latestAiMessageText:
			continuationResult.latestAiMessageText ??
			"Only add missing details; do not repeat the previous AI reply.",
	};
}

function shouldAllowPublicMessages(params: {
	mode: DecisionResult["mode"];
	triggerVisibility?: "public" | "private";
}): boolean {
	if (params.mode === "background_only") {
		return false;
	}
	return (
		params.triggerVisibility === "public" ||
		params.mode === "respond_to_command"
	);
}

async function logBlockedAiCreditUsage(params: {
	ctx: PipelineContext;
	intake: ReadyIntakeResult;
	guardResult: AiCreditGuardResult;
	resolvedModelId: string;
	modelIdOriginal: string;
	modelMigrationApplied: boolean;
	conversationLog: ConversationLog;
	convId: string;
}): Promise<void> {
	const blockedBalanceBefore = params.guardResult.balance;
	const blockedBalanceAfterEstimate =
		typeof blockedBalanceBefore === "number"
			? blockedBalanceBefore - params.guardResult.minimumCharge.totalCredits
			: null;
	try {
		await logAiCreditUsageTimeline({
			db: params.ctx.db,
			organizationId: params.ctx.input.organizationId,
			websiteId: params.ctx.input.websiteId,
			conversationId: params.ctx.input.conversationId,
			visitorId: params.ctx.input.visitorId,
			aiAgentId: params.intake.aiAgent.id,
			workflowRunId: params.ctx.input.workflowRunId,
			triggerMessageId: params.ctx.input.messageId,
			triggerVisibility: params.intake.triggerMessage?.visibility,
			payload: {
				baseCredits: params.guardResult.minimumCharge.baseCredits,
				modelCredits: params.guardResult.minimumCharge.modelCredits,
				toolCredits: params.guardResult.minimumCharge.toolCredits,
				totalCredits: params.guardResult.minimumCharge.totalCredits,
				billableToolCount: params.guardResult.minimumCharge.billableToolCount,
				excludedToolCount: params.guardResult.minimumCharge.excludedToolCount,
				modelId: params.resolvedModelId,
				modelIdOriginal: params.modelIdOriginal,
				modelMigrationApplied: params.modelMigrationApplied,
				balanceBefore: blockedBalanceBefore,
				balanceAfterEstimate: blockedBalanceAfterEstimate,
				mode: params.guardResult.mode,
				blockedReason: params.guardResult.blockedReason ?? "blocked",
				ingestStatus: "skipped",
			},
		});
	} catch (error) {
		params.conversationLog.warn(
			`[ai-agent] conv=${params.convId} | Failed to log blocked AI credit timeline`,
			error
		);
	}
}

async function finalizeAiCreditUsageForRun(params: {
	ctx: PipelineContext;
	intake: ReadyIntakeResult;
	guardResult: AiCreditGuardResult | null;
	result: GenerationResult | null;
	resolvedModelId: string;
	modelIdOriginal: string;
	modelMigrationApplied: boolean;
	conversationLog: ConversationLog;
	convId: string;
}): Promise<void> {
	if (!params.guardResult?.allowed) {
		return;
	}

	const toolCallsForCredits =
		params.result?.chargeableToolCallsByName ?? params.result?.toolCallsByName;
	const charge = toolCallsForCredits
		? calculateAiCreditCharge({
				modelId: params.resolvedModelId,
				toolCallsByName: toolCallsForCredits,
			})
		: getMinimumAiCreditCharge(params.resolvedModelId);

	const balanceBefore = params.guardResult.balance;
	const balanceAfterEstimate =
		typeof balanceBefore === "number"
			? balanceBefore - charge.totalCredits
			: null;
	let ingestStatus: IngestAiCreditUsageStatus | "skipped" = "failed";

	try {
		const ingestResult = await ingestAiCreditUsage({
			organizationId: params.ctx.input.organizationId,
			credits: charge.totalCredits,
			workflowRunId: params.ctx.input.workflowRunId,
			modelId: params.resolvedModelId,
			modelIdOriginal: params.modelIdOriginal,
			modelMigrationApplied: params.modelMigrationApplied,
			mode: params.guardResult.mode,
			baseCredits: charge.baseCredits,
			modelCredits: charge.modelCredits,
			toolCredits: charge.toolCredits,
			billableToolCount: charge.billableToolCount,
			excludedToolCount: charge.excludedToolCount,
			totalToolCount: charge.totalToolCount,
		});
		ingestStatus = ingestResult.status;
		if (ingestStatus === "failed") {
			params.conversationLog.error(
				`[ai-agent] conv=${params.convId} | Failed to ingest AI credit usage`
			);
		}
	} catch (error) {
		ingestStatus = "failed";
		params.conversationLog.error(
			`[ai-agent] conv=${params.convId} | Failed to ingest AI credit usage`,
			error
		);
	}

	try {
		await logAiCreditUsageTimeline({
			db: params.ctx.db,
			organizationId: params.ctx.input.organizationId,
			websiteId: params.ctx.input.websiteId,
			conversationId: params.ctx.input.conversationId,
			visitorId: params.ctx.input.visitorId,
			aiAgentId: params.intake.aiAgent.id,
			workflowRunId: params.ctx.input.workflowRunId,
			triggerMessageId: params.ctx.input.messageId,
			triggerVisibility: params.intake.triggerMessage?.visibility,
			payload: {
				baseCredits: charge.baseCredits,
				modelCredits: charge.modelCredits,
				toolCredits: charge.toolCredits,
				totalCredits: charge.totalCredits,
				billableToolCount: charge.billableToolCount,
				excludedToolCount: charge.excludedToolCount,
				modelId: params.resolvedModelId,
				modelIdOriginal: params.modelIdOriginal,
				modelMigrationApplied: params.modelMigrationApplied,
				balanceBefore,
				balanceAfterEstimate,
				mode: params.guardResult.mode,
				ingestStatus,
			},
		});
	} catch (error) {
		params.conversationLog.warn(
			`[ai-agent] conv=${params.convId} | Failed to log AI credit timeline`,
			error
		);
	}
}

function shouldSendFallbackMessage(params: {
	generation: GenerationResult;
	publicMessagesSent: number;
}): boolean {
	if (params.publicMessagesSent > 0) {
		return false;
	}
	return (
		params.generation.needsFallbackMessage === true ||
		REQUIRED_MESSAGE_ACTIONS.has(params.generation.decision.action)
	);
}

function fallbackMessageForAction(action: string): string {
	switch (action) {
		case "escalate":
			return "Let me connect you with a team member who can help.";
		case "resolve":
			return "I hope that helped! Let me know if you need anything else.";
		default:
			return "Thanks for your message. I'm looking into this now. Could you share any extra details that might help?";
	}
}

async function maybeSendFallbackMessage(params: {
	ctx: PipelineContext;
	intake: ReadyIntakeResult;
	generation: GenerationResult;
	allowPublicMessages: boolean;
	publicMessagesSent: number;
	markPublicMessageSent: (params: {
		messageId: string;
		created: boolean;
		duplicateSuppressed?: boolean;
	}) => void;
	conversationLog: ConversationLog;
	convId: string;
}): Promise<void> {
	const needsFallbackMessage =
		params.allowPublicMessages &&
		shouldSendFallbackMessage({
			generation: params.generation,
			publicMessagesSent: params.publicMessagesSent,
		});
	if (!needsFallbackMessage) {
		return;
	}

	if (params.generation.needsFallbackMessage) {
		params.conversationLog.warn(
			`[ai-agent] conv=${params.convId} | Repair failed, sending fallback message`
		);
	}
	params.conversationLog.warn(
		`[ai-agent] conv=${params.convId} | AI forgot to call sendMessage! Sending fallback...`
	);

	try {
		const fallbackSend = await sendMessage({
			db: params.ctx.db,
			conversationId: params.ctx.input.conversationId,
			organizationId: params.ctx.input.organizationId,
			websiteId: params.ctx.input.websiteId,
			visitorId: params.ctx.input.visitorId,
			aiAgentId: params.intake.aiAgent.id,
			text: fallbackMessageForAction(params.generation.decision.action),
			idempotencyKey: `public:${params.ctx.input.messageId}:fallback`,
		});
		if (!fallbackSend.paused) {
			params.markPublicMessageSent({
				messageId: fallbackSend.messageId,
				created: fallbackSend.created,
			});
		}
		params.conversationLog.log(
			`[ai-agent] conv=${params.convId} | Fallback message sent successfully`
		);
	} catch (error) {
		params.conversationLog.error(
			`[ai-agent] conv=${params.convId} | Failed to send fallback:`,
			error
		);
	}
}

function finalizeMetrics(
	metrics: PipelineMetrics,
	startTime: number
): PipelineMetrics {
	return {
		...metrics,
		totalMs: Date.now() - startTime,
	};
}
