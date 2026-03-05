import { getBehaviorSettings } from "@api/ai-agent/settings";
import {
	createModel,
	hasToolCall,
	stepCountIs,
	ToolLoopAgent,
	type ToolSet,
} from "@api/lib/ai";
import { generateVisitorName } from "@cossistant/core";
import type { PrepareStepFunction } from "ai";
import { logAiPipeline } from "../../logger";
import { emitPipelineGenerationProgress } from "../events";
import { buildPipelineToolset, type PipelineToolBuildResult } from "../tools";
import type { PipelineToolContext, ToolRuntimeState } from "../tools/contracts";
import type {
	CapturedFinalAction,
	GenerationRuntimeInput,
	GenerationRuntimeResult,
} from "./contracts";
import { formatHistoryForGeneration } from "./messages/format-history";
import { buildGenerationSystemPrompt } from "./prompt/builder";

const GENERATION_TIMEOUT_MS = 45_000;
const STOP_STEP_BUFFER = 6;
const FALLBACK_GENERATION_MODEL_ID = "openai/gpt-4o-mini";

type ToolStepLike = {
	toolCalls?: Array<{ toolName?: string }>;
};

type GenerationAttemptOutcome = NonNullable<
	GenerationRuntimeResult["attempts"]
>[number]["outcome"];

type GenerationFailureCode = NonNullable<
	GenerationRuntimeResult["failureCode"]
>;

type RuntimeResultWithoutAttempts = Omit<GenerationRuntimeResult, "attempts">;

function countTotalToolCalls(toolCallsByName: Record<string, number>): number {
	return Object.values(toolCallsByName).reduce((sum, value) => {
		if (!Number.isFinite(value) || value <= 0) {
			return sum;
		}
		return sum + Math.floor(value);
	}, 0);
}

function countNonFinishToolCalls(params: {
	steps: readonly ToolStepLike[] | undefined;
	finishToolNames: Set<string>;
}): number {
	if (!(params.steps && params.steps.length > 0)) {
		return 0;
	}

	let total = 0;

	for (const step of params.steps) {
		for (const call of step.toolCalls ?? []) {
			const toolName = call?.toolName;
			if (!(toolName && typeof toolName === "string")) {
				continue;
			}
			if (params.finishToolNames.has(toolName)) {
				continue;
			}
			total += 1;
		}
	}

	return total;
}

function buildSafeSkipAction(reasoning: string): CapturedFinalAction {
	return {
		action: "skip",
		reasoning,
		confidence: 1,
	};
}

function toUsage(
	value:
		| {
				inputTokens?: number;
				outputTokens?: number;
				totalTokens?: number;
		  }
		| undefined
): GenerationRuntimeResult["usage"] {
	if (!value) {
		return;
	}

	const inputTokens =
		typeof value.inputTokens === "number" ? value.inputTokens : undefined;
	const outputTokens =
		typeof value.outputTokens === "number" ? value.outputTokens : undefined;
	const totalTokens =
		typeof value.totalTokens === "number" ? value.totalTokens : undefined;

	if (
		inputTokens === undefined &&
		outputTokens === undefined &&
		totalTokens === undefined
	) {
		return;
	}

	return {
		inputTokens,
		outputTokens,
		totalTokens,
	};
}

function createToolRuntimeState(): ToolRuntimeState {
	return {
		finalAction: null,
		publicMessagesSent: 0,
		toolCallCounts: {},
		successfulToolCallCounts: {},
		failedToolCallCounts: {},
		chargeableToolCallCounts: {},
		publicSendSequence: 0,
		privateSendSequence: 0,
		sentPublicMessageIds: new Set<string>(),
		lastToolError: null,
	};
}

function buildToolContext(params: {
	input: GenerationRuntimeInput;
	runtimeState: ToolRuntimeState;
}): PipelineToolContext {
	const { input, runtimeState } = params;
	const visitorName =
		input.visitorContext?.name?.trim() ||
		generateVisitorName(input.conversation.visitorId);

	return {
		db: input.db,
		conversation: input.conversation,
		conversationId: input.conversation.id,
		organizationId: input.conversation.organizationId,
		websiteId: input.conversation.websiteId,
		visitorId: input.conversation.visitorId,
		aiAgentId: input.aiAgent.id,
		aiAgentName: input.aiAgent.name,
		visitorName,
		workflowRunId: input.workflowRunId,
		triggerMessageId: input.triggerMessageId,
		triggerMessageCreatedAt: input.triggerMessageCreatedAt,
		triggerSenderType: input.triggerSenderType,
		triggerVisibility: input.triggerVisibility,
		allowPublicMessages: input.allowPublicMessages,
		pipelineKind: input.pipelineKind,
		mode: input.mode,
		isEscalated: input.conversationState.isEscalated,
		startTyping: input.startTyping,
		stopTyping: input.stopTyping,
		runtimeState,
		debugLogger: input.debugLogger,
		deepTraceEnabled: input.deepTraceEnabled,
		tracePayloadMode: input.tracePayloadMode,
	};
}

function emitDebugLog(
	input: GenerationRuntimeInput,
	level: "log" | "warn" | "error",
	message: string,
	payload?: unknown
): void {
	const logger = input.debugLogger;
	const args = payload === undefined ? [message] : [message, payload];

	if (logger) {
		if (level === "warn") {
			logger.warn(...args);
			return;
		}
		if (level === "error") {
			logger.error(...args);
			return;
		}
		logger.log(...args);
		return;
	}

	if (level === "warn") {
		console.warn(...args);
		return;
	}
	if (level === "error") {
		console.error(...args);
		return;
	}
	console.log(...args);
}

function buildFallbackToolset(params: {
	baseToolset: PipelineToolBuildResult;
	allowPublicMessages: boolean;
}): PipelineToolBuildResult {
	const allowedToolNames = new Set<string>(params.baseToolset.finishToolNames);

	if (params.allowPublicMessages) {
		allowedToolNames.add("sendMessage");
	}

	const tools: ToolSet = {};
	const toolNames: string[] = [];
	const finishToolNames: string[] = [];

	for (const toolName of params.baseToolset.toolNames) {
		if (!allowedToolNames.has(toolName)) {
			continue;
		}

		const tool = params.baseToolset.tools[toolName];
		if (!tool) {
			continue;
		}

		tools[toolName] = tool;
		toolNames.push(toolName);

		if (params.baseToolset.finishToolNames.includes(toolName)) {
			finishToolNames.push(toolName);
		}
	}

	return {
		tools,
		toolNames,
		finishToolNames,
	};
}

function recordAttempt(params: {
	attempts: NonNullable<GenerationRuntimeResult["attempts"]>;
	modelId: string;
	attempt: number;
	outcome: GenerationAttemptOutcome;
	durationMs: number;
}): void {
	params.attempts.push({
		modelId: params.modelId,
		attempt: params.attempt,
		outcome: params.outcome,
		durationMs: params.durationMs,
	});
}

async function runGenerationAttempt(params: {
	input: GenerationRuntimeInput;
	attempt: number;
	modelId: string;
	systemPrompt: string;
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	nonFinishToolBudget: number;
	toolsetResolution: PipelineToolBuildResult;
	runtimeState: ToolRuntimeState;
	attempts: NonNullable<GenerationRuntimeResult["attempts"]>;
}): Promise<RuntimeResultWithoutAttempts> {
	const finishToolNameSet = new Set<string>(
		params.toolsetResolution.finishToolNames
	);

	const prepareStep: PrepareStepFunction<ToolSet> = ({ steps }) => {
		const usedNonFinishCalls = countNonFinishToolCalls({
			steps: steps as readonly ToolStepLike[] | undefined,
			finishToolNames: finishToolNameSet,
		});

		if (usedNonFinishCalls >= params.nonFinishToolBudget) {
			return {
				system: params.systemPrompt,
				activeTools: params.toolsetResolution.finishToolNames,
			};
		}

		return {
			system: params.systemPrompt,
		};
	};

	const stopWhen = [
		...params.toolsetResolution.finishToolNames.map((toolName) =>
			hasToolCall(toolName)
		),
		(input: { steps: readonly ToolStepLike[] }) =>
			countNonFinishToolCalls({
				steps: input.steps,
				finishToolNames: finishToolNameSet,
			}) >= params.nonFinishToolBudget,
		stepCountIs(params.nonFinishToolBudget + STOP_STEP_BUFFER),
	];

	const generationAbortController = new AbortController();
	let abortReason: "timeout" | "signal" | null = null;

	const onExternalAbort = () => {
		abortReason = "signal";
		generationAbortController.abort();
	};

	if (params.input.abortSignal) {
		if (params.input.abortSignal.aborted) {
			abortReason = "signal";
			generationAbortController.abort();
		} else {
			params.input.abortSignal.addEventListener("abort", onExternalAbort);
		}
	}

	const timeout = setTimeout(() => {
		abortReason = "timeout";
		generationAbortController.abort();
	}, GENERATION_TIMEOUT_MS);

	const startedAt = Date.now();

	logAiPipeline({
		area: "generation",
		event: "generation_start",
		conversationId: params.input.conversation.id,
		fields: {
			attempt: params.attempt,
			model: params.modelId,
			mode: params.input.mode,
			tools: params.toolsetResolution.toolNames.length,
			finishTools: params.toolsetResolution.finishToolNames.length,
			budget: params.nonFinishToolBudget,
		},
	});
	const deepTraceEnabled = params.input.deepTraceEnabled === true;
	if (deepTraceEnabled) {
		emitDebugLog(
			params.input,
			"log",
			`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=attempt_start attempt=${params.attempt} model=${params.modelId}`
		);
	}

	try {
		await emitPipelineGenerationProgress({
			conversation: params.input.conversation,
			aiAgentId: params.input.aiAgent.id,
			workflowRunId: params.input.workflowRunId,
			phase: "generating",
			message:
				params.attempt === 1
					? "Generating response..."
					: "Retrying response generation...",
			audience: "dashboard",
		}).catch((error) => {
			emitDebugLog(
				params.input,
				"warn",
				`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=progress_generating_failed`,
				error
			);
		});

		const agent = new ToolLoopAgent({
			model: createModel(params.modelId),
			instructions: params.systemPrompt,
			tools: params.toolsetResolution.tools,
			prepareStep,
			toolChoice: "required",
			stopWhen,
			temperature: 0,
		});

		const result = await agent.generate({
			messages: params.messages,
			abortSignal: generationAbortController.signal,
		});

		await emitPipelineGenerationProgress({
			conversation: params.input.conversation,
			aiAgentId: params.input.aiAgent.id,
			workflowRunId: params.input.workflowRunId,
			phase: "finalizing",
			message: "Finalizing response...",
			audience: "dashboard",
		}).catch((error) => {
			emitDebugLog(
				params.input,
				"warn",
				`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=progress_finalizing_failed`,
				error
			);
		});

		const durationMs = Date.now() - startedAt;
		const toolCallsByName = { ...params.runtimeState.toolCallCounts };
		const chargeableToolCallsByName = {
			...params.runtimeState.chargeableToolCallCounts,
		};
		const totalToolCalls = countTotalToolCalls(toolCallsByName);

		if (params.runtimeState.lastToolError?.fatal) {
			recordAttempt({
				attempts: params.attempts,
				modelId: params.modelId,
				attempt: params.attempt,
				outcome: "error",
				durationMs,
			});

			return {
				status: "error",
				action: buildSafeSkipAction("Generation runtime error"),
				error: params.runtimeState.lastToolError.error,
				failureCode: "runtime_error",
				publicMessagesSent: params.runtimeState.publicMessagesSent,
				toolCallsByName,
				chargeableToolCallsByName,
				totalToolCalls,
				usage: toUsage(result.usage),
			};
		}

		if (!params.runtimeState.finalAction) {
			recordAttempt({
				attempts: params.attempts,
				modelId: params.modelId,
				attempt: params.attempt,
				outcome: "error",
				durationMs,
			});

			logAiPipeline({
				area: "generation",
				event: "generation_missing_finish",
				level: "error",
				conversationId: params.input.conversation.id,
				fields: {
					attempt: params.attempt,
					model: params.modelId,
					totalToolCalls,
					publicMessages: params.runtimeState.publicMessagesSent,
				},
			});

			return {
				status: "error",
				action: buildSafeSkipAction("Generation missing finish action"),
				error: "No finish action was captured after generation completed",
				failureCode: "missing_finish_action",
				publicMessagesSent: params.runtimeState.publicMessagesSent,
				toolCallsByName,
				chargeableToolCallsByName,
				totalToolCalls,
				usage: toUsage(result.usage),
			};
		}

		recordAttempt({
			attempts: params.attempts,
			modelId: params.modelId,
			attempt: params.attempt,
			outcome: "completed",
			durationMs,
		});

		return {
			status: "completed",
			action: params.runtimeState.finalAction,
			publicMessagesSent: params.runtimeState.publicMessagesSent,
			toolCallsByName,
			chargeableToolCallsByName,
			totalToolCalls,
			usage: toUsage(result.usage),
		};
	} catch (error) {
		const durationMs = Date.now() - startedAt;
		const toolCallsByName = { ...params.runtimeState.toolCallCounts };
		const chargeableToolCallsByName = {
			...params.runtimeState.chargeableToolCallCounts,
		};
		const totalToolCalls = countTotalToolCalls(toolCallsByName);

		if (
			generationAbortController.signal.aborted ||
			(error instanceof Error && error.name === "AbortError")
		) {
			const failureCode: GenerationFailureCode =
				abortReason === "signal" ? "abort_signal" : "timeout";
			recordAttempt({
				attempts: params.attempts,
				modelId: params.modelId,
				attempt: params.attempt,
				outcome: failureCode === "timeout" ? "timeout" : "error",
				durationMs,
			});

			if (failureCode === "timeout") {
				logAiPipeline({
					area: "generation",
					event: "generation_timeout",
					level: "warn",
					conversationId: params.input.conversation.id,
					fields: {
						attempt: params.attempt,
						model: params.modelId,
						durationMs,
						totalToolCalls,
						publicMessages: params.runtimeState.publicMessagesSent,
					},
				});
			}

			if (params.runtimeState.publicMessagesSent > 0) {
				const reason =
					failureCode === "abort_signal"
						? "Generation aborted by cancellation signal after public response"
						: "Generation timed out after public response";

				return {
					status: "completed",
					action: buildSafeSkipAction(reason),
					aborted: true,
					failureCode,
					publicMessagesSent: params.runtimeState.publicMessagesSent,
					toolCallsByName,
					chargeableToolCallsByName,
					totalToolCalls,
				};
			}

			const errorMessage =
				failureCode === "abort_signal"
					? "Generation aborted by cancellation signal"
					: "Generation timed out";

			return {
				status: "error",
				action: buildSafeSkipAction(`${errorMessage}; retryable failure`),
				error: errorMessage,
				aborted: true,
				failureCode,
				publicMessagesSent: params.runtimeState.publicMessagesSent,
				toolCallsByName,
				chargeableToolCallsByName,
				totalToolCalls,
			};
		}

		recordAttempt({
			attempts: params.attempts,
			modelId: params.modelId,
			attempt: params.attempt,
			outcome: "error",
			durationMs,
		});

		const message =
			error instanceof Error ? error.message : "Generation runtime failed";

		return {
			status: "error",
			action: buildSafeSkipAction("Generation runtime error"),
			error: message,
			failureCode: "runtime_error",
			publicMessagesSent: params.runtimeState.publicMessagesSent,
			toolCallsByName,
			chargeableToolCallsByName,
			totalToolCalls,
		};
	} finally {
		clearTimeout(timeout);
		if (params.input.abortSignal) {
			params.input.abortSignal.removeEventListener("abort", onExternalAbort);
		}
		if (deepTraceEnabled) {
			emitDebugLog(
				params.input,
				"log",
				`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=attempt_end attempt=${params.attempt} model=${params.modelId}`
			);
		}
	}
}

export async function runGenerationRuntime(
	input: GenerationRuntimeInput
): Promise<GenerationRuntimeResult> {
	const runtimeState = createToolRuntimeState();
	const toolContext = buildToolContext({
		input,
		runtimeState,
	});

	await emitPipelineGenerationProgress({
		conversation: input.conversation,
		aiAgentId: input.aiAgent.id,
		workflowRunId: input.workflowRunId,
		phase: "thinking",
		message: "Analyzing conversation context...",
		audience: "dashboard",
	}).catch((error) => {
		emitDebugLog(
			input,
			"warn",
			`[ai-pipeline:generation] conv=${input.conversation.id} workflowRunId=${input.workflowRunId} evt=progress_thinking_failed`,
			error
		);
	});

	const baseToolsetResolution = buildPipelineToolset({
		aiAgent: input.aiAgent,
		context: toolContext,
	});

	if (baseToolsetResolution.toolNames.length === 0) {
		return {
			status: "completed",
			action: buildSafeSkipAction("No tools available after policy gating"),
			publicMessagesSent: runtimeState.publicMessagesSent,
			toolCallsByName: runtimeState.toolCallCounts,
			chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
			totalToolCalls: 0,
			attempts: [],
		};
	}

	if (baseToolsetResolution.finishToolNames.length === 0) {
		return {
			status: "completed",
			action: buildSafeSkipAction("No finish tools available"),
			publicMessagesSent: runtimeState.publicMessagesSent,
			toolCallsByName: runtimeState.toolCallCounts,
			chargeableToolCallsByName: runtimeState.chargeableToolCallCounts,
			totalToolCalls: 0,
			attempts: [],
		};
	}

	const systemPrompt = buildGenerationSystemPrompt({
		input,
		toolset: baseToolsetResolution.tools,
		toolNames: baseToolsetResolution.toolNames,
	});
	const messages = formatHistoryForGeneration(
		input.conversationHistory,
		input.visitorContext?.name ?? null
	);

	const behaviorSettings = getBehaviorSettings(input.aiAgent);
	const nonFinishToolBudget = Math.max(
		1,
		Math.floor(behaviorSettings.maxToolInvocationsPerRun)
	);
	const attempts: NonNullable<GenerationRuntimeResult["attempts"]> = [];

	runtimeState.finalAction = null;
	runtimeState.lastToolError = null;
	const primaryResult = await runGenerationAttempt({
		input,
		attempt: 1,
		modelId: input.aiAgent.model,
		systemPrompt,
		messages,
		nonFinishToolBudget,
		toolsetResolution: baseToolsetResolution,
		runtimeState,
		attempts,
	});

	if (primaryResult.status === "completed") {
		return {
			...primaryResult,
			attempts,
		};
	}

	const shouldFallback =
		primaryResult.status === "error" &&
		primaryResult.publicMessagesSent === 0 &&
		primaryResult.failureCode !== "abort_signal";

	if (!shouldFallback) {
		return {
			...primaryResult,
			attempts,
		};
	}

	const fallbackToolsetResolution = buildFallbackToolset({
		baseToolset: baseToolsetResolution,
		allowPublicMessages: input.allowPublicMessages,
	});

	if (fallbackToolsetResolution.finishToolNames.length === 0) {
		return {
			...primaryResult,
			attempts,
		};
	}

	logAiPipeline({
		area: "generation",
		event: "generation_fallback_next",
		conversationId: input.conversation.id,
		fields: {
			fromModel: input.aiAgent.model,
			toModel: FALLBACK_GENERATION_MODEL_ID,
			failureCode: primaryResult.failureCode ?? "runtime_error",
		},
	});

	runtimeState.finalAction = null;
	runtimeState.lastToolError = null;
	const fallbackResult = await runGenerationAttempt({
		input,
		attempt: 2,
		modelId: FALLBACK_GENERATION_MODEL_ID,
		systemPrompt,
		messages,
		nonFinishToolBudget,
		toolsetResolution: fallbackToolsetResolution,
		runtimeState,
		attempts,
	});

	if (fallbackResult.status === "completed") {
		logAiPipeline({
			area: "generation",
			event: "generation_fallback_success",
			conversationId: input.conversation.id,
			fields: {
				fromModel: input.aiAgent.model,
				toModel: FALLBACK_GENERATION_MODEL_ID,
				attempts: attempts.length,
			},
		});
	}

	return {
		...fallbackResult,
		attempts,
	};
}

export type {
	CapturedFinalAction,
	GenerationMode,
	GenerationRuntimeInput,
	GenerationRuntimeResult,
	GenerationTokenUsage,
	PipelineKind,
} from "./contracts";
