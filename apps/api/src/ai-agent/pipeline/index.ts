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
import { logAiSkillUsageTimeline } from "./skill-usage-timeline";

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
	const metrics = {
		intakeMs: 0,
		decisionMs: 0,
		generationMs: 0,
		executionMs: 0,
		followupMs: 0,
		totalMs: 0,
	};

	console.log(
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

	try {
		// Step 1: Intake - Gather context and validate
		const intakeStart = Date.now();
		intakeResult = await intake(ctx.db, ctx.input);
		metrics.intakeMs = Date.now() - intakeStart;

		if (intakeResult.status !== "ready") {
			console.log(
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
		const resolvedModelId = readyIntake.modelResolution.modelIdResolved;
		const modelIdOriginal = readyIntake.modelResolution.modelIdOriginal;
		const modelMigrationApplied =
			readyIntake.modelResolution.modelMigrationApplied;

		const continuationResult = await continuationGate({
			db: ctx.db,
			conversationId: ctx.input.conversationId,
			organizationId: ctx.input.organizationId,
			triggerMessageId: ctx.input.messageId,
			triggerMessageCreatedAt: ctx.input.messageCreatedAt,
			triggerMessage: intakeResult.triggerMessage,
			conversationHistory: intakeResult.conversationHistory,
		});
		console.log(
			`[ai-agent] conv=${convId} | continuationDecision=${continuationResult.decision} | continuationConfidence=${continuationResult.confidence} | continuationReason=${continuationResult.reason}`
		);

		if (continuationResult.decision === "skip") {
			const skipReason = `Continuation gate skipped trigger: ${continuationResult.reason}`;

			await emitDecisionMade({
				conversation: intakeResult.conversation,
				aiAgentId: intakeResult.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				shouldAct: false,
				reason: skipReason,
				mode: "background_only",
			});

			await emitWorkflowCompleted({
				conversation: intakeResult.conversation,
				aiAgentId: intakeResult.aiAgent.id,
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
			aiAgentId: intakeResult.aiAgent.id,
			triggerMessageId: ctx.input.messageId,
			workflowRunId: ctx.input.workflowRunId,
			triggerVisibility: intakeResult.triggerMessage?.visibility,
		} as const;

		await logDecisionTimelineState({
			toolContext: decisionToolContext,
			state: "partial",
		});

		try {
			let decisionPolicy: string = PROMPT_TEMPLATES.DECISION_POLICY;
			try {
				const decisionPromptBundle = await resolvePromptBundle({
					db: ctx.db,
					aiAgent: intakeResult.aiAgent,
					mode: "background_only",
				});
				decisionPolicy =
					decisionPromptBundle.coreDocuments["decision.md"]?.content?.trim() ||
					PROMPT_TEMPLATES.DECISION_POLICY;
			} catch (error) {
				console.warn(
					`[ai-agent] conv=${convId} | Failed to resolve decision.md, using fallback policy`,
					error
				);
			}

			decisionResult = await decide({
				aiAgent: intakeResult.aiAgent,
				conversation: intakeResult.conversation,
				conversationHistory: intakeResult.conversationHistory,
				conversationState: intakeResult.conversationState,
				triggerMessage: intakeResult.triggerMessage,
				decisionPolicy,
			});

			await logDecisionTimelineState({
				toolContext: decisionToolContext,
				state: "result",
				result: {
					shouldAct: decisionResult.shouldAct,
					mode: decisionResult.mode,
					reason: decisionResult.reason,
				},
			});
		} catch (error) {
			await logDecisionTimelineState({
				toolContext: decisionToolContext,
				state: "error",
				error,
			});
			throw error;
		}

		metrics.decisionMs = Date.now() - decisionStart;

		// Emit decision event
		await emitDecisionMade({
			conversation: intakeResult.conversation,
			aiAgentId: intakeResult.aiAgent.id,
			workflowRunId: ctx.input.workflowRunId,
			shouldAct: decisionResult.shouldAct,
			reason: decisionResult.reason,
			mode: decisionResult.mode,
		});

		if (!decisionResult.shouldAct) {
			console.log(
				`[ai-agent] conv=${convId} | Skipped at decision | reason="${decisionResult.reason}"`
			);

			// Emit completion event (dashboard only since shouldAct=false)
			await emitWorkflowCompleted({
				conversation: intakeResult.conversation,
				aiAgentId: intakeResult.aiAgent.id,
				workflowRunId: ctx.input.workflowRunId,
				status: "skipped",
				reason: decisionResult.reason,
			});

			return {
				status: "skipped",
				reason: decisionResult.reason,
				publicMessagesSent,
				retryable: false,
				metrics: finalizeMetrics(metrics, startTime),
			};
		}

		aiCreditGuardResult = await guardAiCreditRun({
			organizationId: ctx.input.organizationId,
			modelId: resolvedModelId,
		});

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
				console.warn(
					`[ai-agent] conv=${convId} | Failed to log blocked AI credit timeline`,
					error
				);
			}

			await emitWorkflowCompleted({
				conversation: intakeResult.conversation,
				aiAgentId: intakeResult.aiAgent.id,
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
			decisionResult.mode !== "background_only" &&
			(intakeResult.triggerMessage?.visibility === "public" ||
				decisionResult.mode === "respond_to_command");
		willSendVisibleMessages = allowPublicMessages;

		// Callback to stop typing - passed to tools
		// Stops the typing indicator just before a message is sent
		const stopTyping = async (): Promise<void> => {
			if (typingHeartbeat?.running) {
				console.log(
					`[ai-agent] conv=${convId} | Stopping typing via tool callback`
				);
				await typingHeartbeat.stop();
			}
		};

		// Capture conversation and aiAgent for use in closures
		// (TypeScript doesn't narrow inside async callbacks)
		const conversation = intakeResult.conversation;
		const aiAgent = intakeResult.aiAgent;

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
				console.log(
					`[ai-agent] conv=${convId} | Restarting typing via tool callback`
				);
				await typingHeartbeat.start();
			} else if (!typingHeartbeat) {
				// Create new heartbeat if none exists
				typingHeartbeat = new TypingHeartbeat({
					conversation,
					aiAgentId: aiAgent.id,
				});
				console.log(
					`[ai-agent] conv=${convId} | Creating new typing heartbeat via tool callback`
				);
				await typingHeartbeat.start();
			}
		};

		if (willSendVisibleMessages) {
			typingHeartbeat = new TypingHeartbeat({
				conversation: intakeResult.conversation,
				aiAgentId: intakeResult.aiAgent.id,
			});

			console.log(
				`[ai-agent] conv=${convId} | Starting typing indicator (AI will respond)`
			);
			await typingHeartbeat.start();
			typingSessionStarted = true;
		} else {
			console.log(
				`[ai-agent] conv=${convId} | Skipping typing indicator (background_only mode)`
			);
		}

		const finalizeAiCreditUsage = async (
			result: GenerationResult | null
		): Promise<void> => {
			if (!aiCreditGuardResult) {
				return;
			}

			const charge = result?.toolCallsByName
				? calculateAiCreditCharge({
						modelId: resolvedModelId,
						toolCallsByName: result.toolCallsByName,
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
					console.error(
						`[ai-agent] conv=${convId} | Failed to ingest AI credit usage`
					);
				}
			} catch (error) {
				ingestStatus = "failed";
				console.error(
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
				console.warn(
					`[ai-agent] conv=${convId} | Failed to log AI credit timeline`,
					error
				);
			}
		};

		// Step 3: Generation - Call LLM with tools
		const generationStart = Date.now();
		const generationAbortController = new AbortController();
		const generationTimeout = setTimeout(() => {
			console.warn(
				`[ai-agent] conv=${convId} | Generation timeout after ${GENERATION_TIMEOUT_MS}ms`
			);
			generationAbortController.abort();
		}, GENERATION_TIMEOUT_MS);
		try {
			generationResult = await generate({
				db: ctx.db,
				aiAgent: intakeResult.aiAgent,
				conversation: intakeResult.conversation,
				conversationHistory: intakeResult.conversationHistory,
				visitorContext: intakeResult.visitorContext,
				mode: decisionResult.mode,
				humanCommand: decisionResult.humanCommand,
				organizationId: ctx.input.organizationId,
				websiteId: ctx.input.websiteId,
				visitorId: ctx.input.visitorId,
				triggerMessageId: ctx.input.messageId,
				triggerMessageCreatedAt: ctx.input.messageCreatedAt,
				triggerSenderType: intakeResult.triggerMessage?.senderType,
				triggerVisibility: intakeResult.triggerMessage?.visibility,
				abortSignal: generationAbortController.signal,
				stopTyping, // Stop typing just before message is sent
				startTyping, // Start typing for inter-message delays
				onPublicMessageSent: markPublicMessageSent,
				allowPublicMessages,
				isEscalated: decisionResult.isEscalated, // Pass escalation context
				escalationReason: decisionResult.escalationReason,
				smartDecision: decisionResult.smartDecision, // Pass smart decision for prompt context
				continuationHint,
				workflowRunId: ctx.input.workflowRunId, // For progress events in tools
			});
		} finally {
			clearTimeout(generationTimeout);
			metrics.generationMs = Date.now() - generationStart;
			await finalizeAiCreditUsage(generationResult);
		}

		const usedCustomSkills = generationResult.usedCustomSkills;
		if (usedCustomSkills && usedCustomSkills.length > 0) {
			try {
				await logAiSkillUsageTimeline({
					db: ctx.db,
					organizationId: ctx.input.organizationId,
					websiteId: ctx.input.websiteId,
					conversationId: ctx.input.conversationId,
					visitorId: ctx.input.visitorId,
					aiAgentId: intakeResult.aiAgent.id,
					workflowRunId: ctx.input.workflowRunId,
					triggerMessageId: ctx.input.messageId,
					triggerVisibility: intakeResult.triggerMessage?.visibility,
					usedCustomSkills,
				});
			} catch (error) {
				console.warn(
					`[ai-agent] conv=${convId} | Failed to log AI skill usage timeline`,
					error
				);
			}
		}

		// FALLBACK: If AI returned respond/escalate/resolve but didn't call sendMessage,
		// send a fallback message so the visitor isn't left without a response
		const requiresMessage = ["respond", "escalate", "resolve"].includes(
			generationResult.decision.action
		);
		const sentMessages = publicMessagesSent;
		const missingAuthoritativeSend = sentMessages === 0;
		const needsFallbackMessage =
			missingAuthoritativeSend &&
			(generationResult.needsFallbackMessage || requiresMessage);

		if (needsFallbackMessage && allowPublicMessages) {
			if (generationResult.needsFallbackMessage) {
				console.warn(
					`[ai-agent] conv=${convId} | Repair failed, sending fallback message`
				);
			}
			console.warn(
				`[ai-agent] conv=${convId} | AI forgot to call sendMessage! Sending fallback...`
			);

			// Construct a fallback message based on the action
			let fallbackMessage: string;
			switch (generationResult.decision.action) {
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
					aiAgentId: intakeResult.aiAgent.id,
					text: fallbackMessage,
					idempotencyKey: `public:${ctx.input.messageId}:fallback`,
				});
				if (!fallbackSend.paused) {
					markPublicMessageSent({
						messageId: fallbackSend.messageId,
						created: fallbackSend.created,
					});
				}
				console.log(
					`[ai-agent] conv=${convId} | Fallback message sent successfully`
				);
			} catch (fallbackError) {
				console.error(
					`[ai-agent] conv=${convId} | Failed to send fallback:`,
					fallbackError
				);
			}
		}

		// Step 4: Execution - Execute actions
		const executionStart = Date.now();

		// Get visitor display name (from contact or generate a friendly name)
		const visitorName =
			intakeResult.visitorContext?.name ??
			generateVisitorName(ctx.input.visitorId);

		executionResult = await execute({
			db: ctx.db,
			aiAgent: intakeResult.aiAgent,
			conversation: intakeResult.conversation,
			decision: generationResult.decision,
			jobId: ctx.input.jobId,
			messageId: ctx.input.messageId,
			organizationId: ctx.input.organizationId,
			websiteId: ctx.input.websiteId,
			visitorId: ctx.input.visitorId,
			visitorName,
		});
		metrics.executionMs = Date.now() - executionStart;
		// Typing already stopped after generation

		// Step 5: Followup - Cleanup and emit events
		const followupStart = Date.now();
		await followup({
			db: ctx.db,
			aiAgent: intakeResult.aiAgent,
			conversation: intakeResult.conversation,
			decision: generationResult.decision,
			executionResult,
		});
		metrics.followupMs = Date.now() - followupStart;

		// Emit completion event (success - notify widget)
		await emitWorkflowCompleted({
			conversation: intakeResult.conversation,
			aiAgentId: intakeResult.aiAgent.id,
			workflowRunId: ctx.input.workflowRunId,
			status: "success",
			action: generationResult.decision.action,
		});

		const finalMetrics = finalizeMetrics(metrics, startTime);
		console.log(
			`[ai-agent] conv=${convId} | Completed | action=${generationResult.decision.action} | total=${finalMetrics.totalMs}ms`
		);

		return {
			status: "completed",
			action: generationResult.decision.action,
			publicMessagesSent,
			retryable: false,
			metrics: finalMetrics,
		};
	} catch (error) {
		// Run followup for cleanup (workflow state, etc.)
		if (intakeResult?.status === "ready") {
			try {
				await followup({
					db: ctx.db,
					aiAgent: intakeResult.aiAgent,
					conversation: intakeResult.conversation,
					decision: null,
					executionResult: null,
				});
			} catch {
				// Ignore cleanup errors
			}
		}

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		console.error(`[ai-agent] conv=${convId} | Error | ${errorMessage}`);

		// Emit error completion event (dashboard only)
		if (intakeResult?.status === "ready") {
			try {
				await emitWorkflowCompleted({
					conversation: intakeResult.conversation,
					aiAgentId: intakeResult.aiAgent.id,
					workflowRunId: ctx.input.workflowRunId,
					status: "error",
					reason: errorMessage,
				});
			} catch {
				// Ignore event emission errors during error handling
			}
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
				console.warn(
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
			try {
				await emitTypingStop({
					conversation: intakeResult.conversation,
					aiAgentId: intakeResult.aiAgent.id,
				});
			} catch (error) {
				console.warn(
					`[ai-agent] conv=${convId} | Final typing stop emit failed:`,
					error
				);
			}
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
