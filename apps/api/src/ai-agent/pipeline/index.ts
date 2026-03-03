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
	emitTypingStop,
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
	const metrics = {
		intakeMs: 0,
		decisionMs: 0,
		generationMs: 0,
		executionMs: 0,
		followupMs: 0,
		totalMs: 0,
	};

	conversationLog.log(
		`[ai-agent] conv=${convId} | Starting pipeline | trigger=${ctx.input.messageId}`
	);

	let intakeResult: IntakeResult | null = null;
	let decisionResult: DecisionResult | null = null;
	let generationResult: GenerationResult | null = null;
	let executionResult: ExecutionResult | null = null;
	let typingHeartbeat: TypingHeartbeat | null = null;
	let willSendVisibleMessages = false;
	let typingSessionStarted = false;
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
	type DecisionPolicyResolution = {
		policy: string;
		fallback: "none" | "missing" | "error";
		error?: unknown;
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

	const safeEmitDecisionMade = async (
		params: Parameters<typeof emitDecisionMade>[0]
	): Promise<void> => {
		try {
			await runTracedStage("emit_decision_made", async () =>
				emitDecisionMade(params)
			);
		} catch (error) {
			conversationLog.warn(
				`[ai-agent] conv=${convId} | Failed to emit decision event`,
				error
			);
		}
	};

	const safeEmitWorkflowCompleted = async (
		params: Parameters<typeof emitWorkflowCompleted>[0]
	): Promise<void> => {
		try {
			await runTracedStage("emit_workflow_completed", async () =>
				emitWorkflowCompleted(params)
			);
		} catch (error) {
			conversationLog.warn(
				`[ai-agent] conv=${convId} | Failed to emit workflow completed event`,
				error
			);
		}
	};

	const safeEmitSeen = async (
		params: Parameters<typeof emitSeen>[0]
	): Promise<void> => {
		try {
			await runTracedStage("emit_seen", async () => emitSeen(params));
		} catch (error) {
			conversationLog.warn(
				`[ai-agent] conv=${convId} | Failed to emit seen event`,
				error
			);
		}
	};

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
			return {
				status: "skipped",
				reason: intakeResult.reason,
				publicMessagesSent,
				retryable: false,
				metrics: finalizeMetrics(metrics, startTime),
			};
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
		const decisionPolicyStart = Date.now();
		traceLog("log", "stage.start", "stage=decision_policy_resolution");
		const decisionPolicyPromise: Promise<DecisionPolicyResolution> =
			resolvePromptBundle({
				db: ctx.db,
				aiAgent: readyIntake.aiAgent,
				mode: "background_only",
			})
				.then((bundle) => {
					const policy = bundle.coreDocuments["decision.md"]?.content?.trim();
					if (!policy) {
						traceLog(
							"warn",
							"stage.end",
							`stage=decision_policy_resolution | durationMs=${Date.now() - decisionPolicyStart} | fallback=missing`
						);
						return {
							policy: PROMPT_TEMPLATES.DECISION_POLICY,
							fallback: "missing",
						} as const;
					}
					traceLog(
						"log",
						"stage.end",
						`stage=decision_policy_resolution | durationMs=${Date.now() - decisionPolicyStart} | fallback=none`
					);
					return { policy, fallback: "none" } as const;
				})
				.catch((error) => {
					traceLog(
						"warn",
						"stage.error",
						`stage=decision_policy_resolution | durationMs=${Date.now() - decisionPolicyStart} | fallback=error`,
						error
					);
					return {
						policy: PROMPT_TEMPLATES.DECISION_POLICY,
						fallback: "error" as const,
						error,
					};
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

			return {
				status: "skipped",
				reason: skipReason,
				publicMessagesSent,
				retryable: false,
				metrics: finalizeMetrics(metrics, startTime),
			};
		}

		if (continuationResult.decision === "supplement") {
			continuationHint = {
				reason: continuationResult.reason,
				confidence: continuationResult.confidence,
				deltaHint: continuationResult.deltaHint,
				latestAiMessageId: continuationResult.latestAiMessageId ?? "",
				latestAiMessageText:
					continuationResult.latestAiMessageText ??
					"Only add missing details; do not repeat the previous AI reply.",
			};
		}

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
		decisionResult = readyDecision;

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

			return {
				status: "skipped",
				reason: readyDecision.reason,
				publicMessagesSent,
				retryable: false,
				metrics: finalizeMetrics(metrics, startTime),
			};
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
			const blockedBalanceBefore = aiCreditGuardResult.balance;
			const blockedBalanceAfterEstimate =
				typeof blockedBalanceBefore === "number"
					? blockedBalanceBefore -
						aiCreditGuardResult.minimumCharge.totalCredits
					: null;

			try {
				await logAiCreditUsageTimeline({
					db: ctx.db,
					organizationId: ctx.input.organizationId,
					websiteId: ctx.input.websiteId,
					conversationId: ctx.input.conversationId,
					visitorId: ctx.input.visitorId,
					aiAgentId: readyIntake.aiAgent.id,
					workflowRunId: ctx.input.workflowRunId,
					triggerMessageId: ctx.input.messageId,
					triggerVisibility: readyIntake.triggerMessage?.visibility,
					payload: {
						baseCredits: aiCreditGuardResult.minimumCharge.baseCredits,
						modelCredits: aiCreditGuardResult.minimumCharge.modelCredits,
						toolCredits: aiCreditGuardResult.minimumCharge.toolCredits,
						totalCredits: aiCreditGuardResult.minimumCharge.totalCredits,
						billableToolCount:
							aiCreditGuardResult.minimumCharge.billableToolCount,
						excludedToolCount:
							aiCreditGuardResult.minimumCharge.excludedToolCount,
						modelId: resolvedModelId,
						modelIdOriginal,
						modelMigrationApplied,
						balanceBefore: blockedBalanceBefore,
						balanceAfterEstimate: blockedBalanceAfterEstimate,
						mode: aiCreditGuardResult.mode,
						blockedReason: aiCreditGuardResult.blockedReason ?? "blocked",
						ingestStatus: "skipped",
					},
				});
			} catch (error) {
				conversationLog.warn(
					`[ai-agent] conv=${convId} | Failed to log blocked AI credit timeline`,
					error
				);
			}

			await safeEmitWorkflowCompleted({
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				status: "skipped",
				reason: blockedReason,
			});

			return {
				status: "skipped",
				reason: blockedReason,
				publicMessagesSent,
				retryable: false,
				metrics: finalizeMetrics(metrics, startTime),
			};
		}

		// Only start typing if AI may send visible visitor messages.
		// background_only = private/internal only.
		// respond_to_command may still send visitor messages even for private team triggers.
		// This prevents "phantom typing" when AI observes but doesn't respond.
		const allowPublicMessages =
			readyDecision.mode !== "background_only" &&
			(readyIntake.triggerMessage?.visibility === "public" ||
				readyDecision.mode === "respond_to_command");
		willSendVisibleMessages = allowPublicMessages;

		// Callback to stop typing - passed to tools
		// Stops the typing indicator just before a message is sent
		const stopTyping = async (): Promise<void> => {
			if (typingHeartbeat?.running) {
				conversationLog.log(
					`[ai-agent] conv=${convId} | Stopping typing via tool callback`
				);
				await typingHeartbeat.stop();
			}
		};

		// Capture conversation and aiAgent for use in closures
		// (TypeScript doesn't narrow inside async callbacks)
		const conversation = readyIntake.conversation;
		const aiAgent = readyIntake.aiAgent;

		// Callback to start/restart typing - passed to tools
		// Used to show typing indicator during inter-message delays
		// This ensures users see "typing..." between multiple messages
		const startTyping = async (): Promise<void> => {
			// Only start typing if we should be showing typing indicators
			if (!willSendVisibleMessages) {
				return;
			}

			// If heartbeat was stopped, restart it
			if (typingHeartbeat && !typingHeartbeat.running) {
				conversationLog.log(
					`[ai-agent] conv=${convId} | Restarting typing via tool callback`
				);
				await typingHeartbeat.start();
			} else if (!typingHeartbeat) {
				// Create new heartbeat if none exists
				typingHeartbeat = new TypingHeartbeat({
					conversation,
					aiAgentId: aiAgent.id,
				});
				conversationLog.log(
					`[ai-agent] conv=${convId} | Creating new typing heartbeat via tool callback`
				);
				await typingHeartbeat.start();
			}
		};

		if (willSendVisibleMessages) {
			typingHeartbeat = new TypingHeartbeat({
				conversation: readyIntake.conversation,
				aiAgentId: readyIntake.aiAgent.id,
			});

			conversationLog.log(
				`[ai-agent] conv=${convId} | Starting typing indicator (AI will respond)`
			);
			await typingHeartbeat.start();
			typingSessionStarted = true;
		} else {
			conversationLog.log(
				`[ai-agent] conv=${convId} | Skipping typing indicator (background_only mode)`
			);
		}

		const finalizeAiCreditUsage = async (
			result: GenerationResult | null
		): Promise<void> => {
			if (!aiCreditGuardResult) {
				return;
			}

			const toolCallsForCredits =
				result?.chargeableToolCallsByName ?? result?.toolCallsByName;
			const charge = toolCallsForCredits
				? calculateAiCreditCharge({
						modelId: resolvedModelId,
						toolCallsByName: toolCallsForCredits,
					})
				: getMinimumAiCreditCharge(resolvedModelId);

			const balanceBefore = aiCreditGuardResult.balance;
			const balanceAfterEstimate =
				typeof balanceBefore === "number"
					? balanceBefore - charge.totalCredits
					: null;
			let ingestStatus: IngestAiCreditUsageStatus | "skipped" = "failed";

			try {
				const ingestResult = await ingestAiCreditUsage({
					organizationId: ctx.input.organizationId,
					credits: charge.totalCredits,
					workflowRunId: ctx.input.workflowRunId,
					modelId: resolvedModelId,
					modelIdOriginal,
					modelMigrationApplied,
					mode: aiCreditGuardResult.mode,
					baseCredits: charge.baseCredits,
					modelCredits: charge.modelCredits,
					toolCredits: charge.toolCredits,
					billableToolCount: charge.billableToolCount,
					excludedToolCount: charge.excludedToolCount,
					totalToolCount: charge.totalToolCount,
				});
				ingestStatus = ingestResult.status;
				if (ingestStatus === "failed") {
					conversationLog.error(
						`[ai-agent] conv=${convId} | Failed to ingest AI credit usage`
					);
				}
			} catch (error) {
				ingestStatus = "failed";
				conversationLog.error(
					`[ai-agent] conv=${convId} | Failed to ingest AI credit usage`,
					error
				);
			}

			try {
				await logAiCreditUsageTimeline({
					db: ctx.db,
					organizationId: ctx.input.organizationId,
					websiteId: ctx.input.websiteId,
					conversationId: ctx.input.conversationId,
					visitorId: ctx.input.visitorId,
					aiAgentId: readyIntake.aiAgent.id,
					workflowRunId: ctx.input.workflowRunId,
					triggerMessageId: ctx.input.messageId,
					triggerVisibility: readyIntake.triggerMessage?.visibility,
					payload: {
						baseCredits: charge.baseCredits,
						modelCredits: charge.modelCredits,
						toolCredits: charge.toolCredits,
						totalCredits: charge.totalCredits,
						billableToolCount: charge.billableToolCount,
						excludedToolCount: charge.excludedToolCount,
						modelId: resolvedModelId,
						modelIdOriginal,
						modelMigrationApplied,
						balanceBefore,
						balanceAfterEstimate,
						mode: aiCreditGuardResult.mode,
						ingestStatus,
					},
				});
			} catch (error) {
				conversationLog.warn(
					`[ai-agent] conv=${convId} | Failed to log AI credit timeline`,
					error
				);
			}
		};

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
					stopTyping, // Stop typing just before message is sent
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

		// FALLBACK: If AI returned respond/escalate/resolve but didn't call sendMessage,
		// send a fallback message so the visitor isn't left without a response
		const requiresMessage = ["respond", "escalate", "resolve"].includes(
			readyGeneration.decision.action
		);
		const sentMessages = publicMessagesSent;
		const missingAuthoritativeSend = sentMessages === 0;
		const needsFallbackMessage =
			missingAuthoritativeSend &&
			(readyGeneration.needsFallbackMessage || requiresMessage);

		if (needsFallbackMessage && allowPublicMessages) {
			if (readyGeneration.needsFallbackMessage) {
				conversationLog.warn(
					`[ai-agent] conv=${convId} | Repair failed, sending fallback message`
				);
			}
			conversationLog.warn(
				`[ai-agent] conv=${convId} | AI forgot to call sendMessage! Sending fallback...`
			);

			// Construct a fallback message based on the action
			let fallbackMessage: string;
			switch (readyGeneration.decision.action) {
				case "escalate":
					fallbackMessage =
						"Let me connect you with a team member who can help.";
					break;
				case "resolve":
					fallbackMessage =
						"I hope that helped! Let me know if you need anything else.";
					break;
				default:
					// For respond, use a safe generic message (do not leak reasoning)
					fallbackMessage =
						"Thanks for your message. I'm looking into this now. Could you share any extra details that might help?";
			}

			try {
				const fallbackSend = await sendMessage({
					db: ctx.db,
					conversationId: convId,
					organizationId: ctx.input.organizationId,
					websiteId: ctx.input.websiteId,
					visitorId: ctx.input.visitorId,
					aiAgentId: readyIntake.aiAgent.id,
					text: fallbackMessage,
					idempotencyKey: `public:${ctx.input.messageId}:fallback`,
				});
				if (!fallbackSend.paused) {
					markPublicMessageSent({
						messageId: fallbackSend.messageId,
						created: fallbackSend.created,
					});
				}
				conversationLog.log(
					`[ai-agent] conv=${convId} | Fallback message sent successfully`
				);
			} catch (fallbackError) {
				conversationLog.error(
					`[ai-agent] conv=${convId} | Failed to send fallback:`,
					fallbackError
				);
			}
		}

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

		return {
			status: "completed",
			action: readyGeneration.decision.action,
			publicMessagesSent,
			retryable: false,
			metrics: finalMetrics,
		};
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

		return {
			status: "error",
			error: errorMessage,
			publicMessagesSent,
			retryable: publicMessagesSent === 0,
			metrics: finalizeMetrics(metrics, startTime),
		};
	} finally {
		// Single authoritative typing cleanup.
		if (typingHeartbeat?.running) {
			try {
				await typingHeartbeat.stop();
			} catch (error) {
				conversationLog.warn(
					`[ai-agent] conv=${convId} | Failed to stop typing heartbeat in cleanup:`,
					error
				);
			}
		}

		if (
			typingSessionStarted &&
			willSendVisibleMessages &&
			intakeResult?.status === "ready"
		) {
			const readyIntakeForTypingStop = intakeResult;
			try {
				await emitTypingStop({
					conversation: readyIntakeForTypingStop.conversation,
					aiAgentId: readyIntakeForTypingStop.aiAgent.id,
				});
			} catch (error) {
				conversationLog.warn(
					`[ai-agent] conv=${convId} | Final typing stop emit failed:`,
					error
				);
			}
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

function finalizeMetrics(
	metrics: AiAgentPipelineResult["metrics"],
	startTime: number
): AiAgentPipelineResult["metrics"] {
	return {
		...metrics,
		totalMs: Date.now() - startTime,
	};
}
