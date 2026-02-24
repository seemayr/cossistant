/**
 * Pipeline Step 3: Generation
 *
 * This step generates the AI response using the LLM with tools.
 * It builds the prompt dynamically based on context and behavior settings.
 *
 * KEY DESIGN: Tools-only approach (no structured output)
 * The AI MUST call tools for everything:
 * - sendMessage() to communicate with visitor
 * - sendPrivateMessage() to leave notes for team
 * - respond()/escalate()/resolve()/etc. to signal completion
 *
 * This forces the model to use tools rather than skipping them.
 */

import type { Database } from "@api/db";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { env } from "@api/env";
import {
	createModel,
	hasToolCall,
	stepCountIs,
	ToolLoopAgent,
} from "@api/lib/ai";
import {
	AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES,
	AI_AGENT_TOOL_CATALOG,
	parseSkillFileContent,
	stripSkillMarkdownExtension,
} from "@cossistant/types";
import { type PrepareStepFunction, type ToolSet, tool } from "ai";
import { z } from "zod";
import {
	detectPromptInjection,
	logInjectionAttempt,
} from "../analysis/injection";
import type { RoleAwareMessage } from "../context/conversation";
import type { VisitorContext } from "../context/visitor";
import type { AiDecision } from "../output/schemas";
import type { ResolvedSkillPromptDocument } from "../prompts/resolver";
import { resolvePromptBundle } from "../prompts/resolver";
import { buildSystemPrompt, type PromptSkillDocument } from "../prompts/system";
import { getBehaviorSettings } from "../settings";
import {
	createActionCapture,
	getCapturedAction,
	getRepairTools,
	getToolsForGeneration,
	resetCapturedAction,
	type ToolContext,
} from "../tools";
import type { ContinuationHint } from "./1b-continuation-gate";
import type { ResponseMode } from "./2-decision";
import type { SmartDecisionResult } from "./2a-smart-decision";

export type GenerationResult = {
	decision: AiDecision;
	/** Whether generation was aborted due to cancellation */
	aborted?: boolean;
	/** Whether a repair attempt failed and fallback messaging is required */
	needsFallbackMessage?: boolean;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
	};
	/** Tool call counts from this generation */
	toolCalls?: {
		sendMessage: number;
		sendPrivateMessage: number;
	};
	/** Full per-tool call counts from this generation */
	toolCallsByName?: Record<string, number>;
	/** Total number of tool calls from this generation */
	totalToolCalls?: number;
	/** Custom skills explicitly read via loadSkill() in this run */
	usedCustomSkills?: UsedCustomSkill[];
};

export type UsedCustomSkill = {
	name: string;
	description?: string;
};

type GenerationInput = {
	db: Database;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	conversationHistory: RoleAwareMessage[];
	visitorContext: VisitorContext | null;
	mode: ResponseMode;
	humanCommand: string | null;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	/** Trigger message ID - used for idempotency keys in tools */
	triggerMessageId: string;
	/** Trigger message timestamp */
	triggerMessageCreatedAt?: string;
	/** Trigger sender type */
	triggerSenderType?: "visitor" | "human_agent" | "ai_agent";
	/** Trigger visibility */
	triggerVisibility?: "public" | "private";
	/** Optional abort signal for interruption handling */
	abortSignal?: AbortSignal;
	/** Callback to stop the typing indicator just before a message is sent */
	stopTyping?: () => Promise<void>;
	/** Callback to start/restart the typing indicator during inter-message delays */
	startTyping?: () => Promise<void>;
	/** Callback when a public message send resolves */
	onPublicMessageSent?: ToolContext["onPublicMessageSent"];
	/** Whether public visitor messages are allowed */
	allowPublicMessages: boolean;
	/** Whether conversation is currently escalated */
	isEscalated?: boolean;
	/** Reason for escalation if escalated */
	escalationReason?: string | null;
	/** Smart decision result if AI was used to decide */
	smartDecision?: SmartDecisionResult;
	/** Continuation hint when a queued trigger needs incremental follow-up only */
	continuationHint?: ContinuationHint;
	/** Workflow run ID for progress events */
	workflowRunId?: string;
};

const MIN_TOOL_INVOCATIONS_PER_RUN = 10;
const MAX_TOOL_INVOCATIONS_PER_RUN = 50;
const DEFAULT_TOOL_INVOCATIONS_PER_RUN = 15;
const MAX_CUSTOM_SKILLS_IN_PROMPT = 5;
const FINISH_TOOL_NAMES = [
	"respond",
	"escalate",
	"resolve",
	"markSpam",
	"skip",
	"wait",
] as const;
const FINISH_TOOL_NAME_SET = new Set<string>(FINISH_TOOL_NAMES);
const TOOL_METADATA_BY_DEFAULT_SKILL_NAME = new Map(
	AI_AGENT_TOOL_CATALOG.map((entry) => [entry.defaultSkill.name, entry])
);
const LOAD_SKILL_TOOL_NAME = "loadSkill";

export type RuntimeCustomSkillCatalogEntry = {
	fileName: string;
	displayName: string;
	description: string;
	content: string;
	priority: number;
};

type ToolCallLike = {
	toolName?: string;
};

type ToolStepLike = {
	toolCalls?: ToolCallLike[];
};

function clampToolInvocationBudget(
	rawValue: number | null | undefined
): number {
	if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
		return DEFAULT_TOOL_INVOCATIONS_PER_RUN;
	}
	return Math.min(
		MAX_TOOL_INVOCATIONS_PER_RUN,
		Math.max(MIN_TOOL_INVOCATIONS_PER_RUN, Math.floor(rawValue))
	);
}

function isFinishToolName(toolName: string): boolean {
	return FINISH_TOOL_NAME_SET.has(toolName);
}

export function getNonFinishToolCallCount(
	toolCallsByName: Record<string, number>
): number {
	return Object.entries(toolCallsByName).reduce(
		(total, [toolName, rawCount]) => {
			if (!Number.isFinite(rawCount) || rawCount <= 0) {
				return total;
			}
			if (isFinishToolName(toolName)) {
				return total;
			}
			return total + Math.floor(rawCount);
		},
		0
	);
}

function countNonFinishToolCallsFromSteps(
	steps: ToolStepLike[] | undefined
): number {
	if (!steps || steps.length === 0) {
		return 0;
	}

	let total = 0;
	for (const step of steps) {
		for (const toolCall of step.toolCalls ?? []) {
			const toolName = toolCall?.toolName;
			if (!(toolName && typeof toolName === "string")) {
				continue;
			}
			if (isFinishToolName(toolName)) {
				continue;
			}
			total += 1;
		}
	}
	return total;
}

function buildStopConditions(params: {
	toolBudgetCap: number;
	usedNonFinishCallsOffset?: number;
	finishToolNames?: readonly string[];
}) {
	const finishToolNames = params.finishToolNames ?? FINISH_TOOL_NAMES;
	const usedNonFinishCallsOffset = params.usedNonFinishCallsOffset ?? 0;

	return [
		...finishToolNames.map((toolName) => hasToolCall(toolName)),
		({ steps }: { steps: ToolStepLike[] }) =>
			usedNonFinishCallsOffset + countNonFinishToolCallsFromSteps(steps) >=
			params.toolBudgetCap,
		stepCountIs(params.toolBudgetCap + 2),
	];
}

function getFinishToolsInToolset(tools: ToolSet): string[] {
	return Object.keys(tools).filter((toolName) => isFinishToolName(toolName));
}

export function selectSkillsForPrompt(input: {
	enabledSkills: ResolvedSkillPromptDocument[];
	maxCustomSkills?: number;
}): ResolvedSkillPromptDocument[] {
	const maxCustomSkills = input.maxCustomSkills ?? MAX_CUSTOM_SKILLS_IN_PROMPT;
	const reservedToolSkillNames = new Set<string>(
		AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES
	);

	const toolAttachedSkills = input.enabledSkills.filter(
		(skill) => skill.source === "tool" || reservedToolSkillNames.has(skill.name)
	);
	toolAttachedSkills.sort((a, b) => {
		if (a.priority !== b.priority) {
			return a.priority - b.priority;
		}
		return a.name.localeCompare(b.name);
	});
	const customEnabledSkills = input.enabledSkills.filter(
		(skill) =>
			skill.source === "custom" && !reservedToolSkillNames.has(skill.name)
	);
	customEnabledSkills.sort((a, b) => {
		if (b.priority !== a.priority) {
			return b.priority - a.priority;
		}
		return a.name.localeCompare(b.name);
	});

	return [
		...toolAttachedSkills,
		...customEnabledSkills.slice(0, maxCustomSkills),
	];
}

export function buildRuntimeSkillDocuments(input: {
	enabledSkills: ResolvedSkillPromptDocument[];
	runtimeToolIds: string[];
	maxCustomSkills?: number;
}): ResolvedSkillPromptDocument[] {
	const maxCustomSkills = input.maxCustomSkills ?? MAX_CUSTOM_SKILLS_IN_PROMPT;
	const runtimeToolIdSet = new Set(input.runtimeToolIds);
	const enabledToolSkillsByName = new Map(
		input.enabledSkills
			.filter((skill) => skill.source === "tool")
			.map((skill) => [skill.name, skill])
	);
	const reservedToolSkillNames = new Set<string>(
		AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES
	);

	const runtimeToolSkills: ResolvedSkillPromptDocument[] =
		AI_AGENT_TOOL_CATALOG.filter((entry) => runtimeToolIdSet.has(entry.id)).map(
			(entry) => {
				const overrideDocument = enabledToolSkillsByName.get(
					entry.defaultSkill.name
				);
				return {
					id: overrideDocument?.id ?? `default:${entry.defaultSkill.name}`,
					name: entry.defaultSkill.name,
					content: overrideDocument?.content ?? entry.defaultSkill.content,
					priority: entry.order,
					source: "tool",
				};
			}
		);

	const customSkills = input.enabledSkills
		.filter(
			(skill) =>
				skill.source === "custom" && !reservedToolSkillNames.has(skill.name)
		)
		.sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority;
			}
			return a.name.localeCompare(b.name);
		})
		.slice(0, maxCustomSkills);

	return [...runtimeToolSkills, ...customSkills];
}

export function buildRuntimeCustomSkillCatalog(input: {
	enabledSkills: ResolvedSkillPromptDocument[];
}): RuntimeCustomSkillCatalogEntry[] {
	const reservedToolSkillNames = new Set<string>(
		AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES
	);

	return input.enabledSkills
		.filter(
			(skill) =>
				skill.source === "custom" && !reservedToolSkillNames.has(skill.name)
		)
		.sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority;
			}
			return a.name.localeCompare(b.name);
		})
		.map((skill) => {
			const parsedSkill = parseSkillFileContent({
				content: skill.content,
				canonicalFileName: skill.name,
			});

			return {
				fileName: skill.name,
				displayName: parsedSkill.name,
				description: parsedSkill.description,
				content: parsedSkill.body,
				priority: skill.priority,
			};
		});
}

function resolveCustomSkillFromCatalog(params: {
	catalog: RuntimeCustomSkillCatalogEntry[];
	skillName: string;
}): RuntimeCustomSkillCatalogEntry | undefined {
	const normalized = params.skillName.trim().toLowerCase();
	if (!normalized) {
		return;
	}

	return params.catalog.find((skill) => {
		if (skill.fileName.toLowerCase() === normalized) {
			return true;
		}

		if (
			stripSkillMarkdownExtension(skill.fileName).toLowerCase() === normalized
		) {
			return true;
		}

		return skill.displayName.toLowerCase() === normalized;
	});
}

export function buildUsedCustomSkillUsage(input: {
	customSkillCatalog: RuntimeCustomSkillCatalogEntry[];
	loadedCustomSkillFileNames: Set<string>;
}): UsedCustomSkill[] {
	return input.customSkillCatalog
		.filter((skill) => input.loadedCustomSkillFileNames.has(skill.fileName))
		.map((skill) => ({
			name: skill.fileName,
			description: skill.description,
		}));
}

function buildPromptSkillDocuments(input: {
	toolSkillDocuments: ResolvedSkillPromptDocument[];
	customSkillCatalog: RuntimeCustomSkillCatalogEntry[];
	loadedCustomSkillFileNames: Set<string>;
}): PromptSkillDocument[] {
	const toolSkillDocuments = input.toolSkillDocuments.map((skill) => {
		const toolMetadata =
			skill.source === "tool"
				? TOOL_METADATA_BY_DEFAULT_SKILL_NAME.get(skill.name)
				: undefined;
		const parsedSkill = parseSkillFileContent({
			content: skill.content,
			canonicalFileName: skill.name,
		});
		return {
			name: parsedSkill.name,
			content: parsedSkill.body,
			source: skill.source,
			toolId: toolMetadata?.id,
			toolLabel: toolMetadata?.label,
		} satisfies PromptSkillDocument;
	});

	const loadedCustomSkillDocuments = input.customSkillCatalog
		.filter((skill) => input.loadedCustomSkillFileNames.has(skill.fileName))
		.map(
			(skill) =>
				({
					name: skill.displayName,
					content: skill.content,
					source: "custom",
				}) satisfies PromptSkillDocument
		);

	return [...toolSkillDocuments, ...loadedCustomSkillDocuments];
}

export function buildToolCallsByName(
	toolCalls: ToolCallLike[]
): Record<string, number> {
	const counts: Record<string, number> = {};

	for (const toolCall of toolCalls) {
		if (!(toolCall?.toolName && typeof toolCall.toolName === "string")) {
			continue;
		}

		counts[toolCall.toolName] = (counts[toolCall.toolName] ?? 0) + 1;
	}

	return counts;
}

export function getTotalToolCalls(
	toolCallsByName: Record<string, number>
): number {
	return Object.values(toolCallsByName).reduce((sum, value) => {
		if (!Number.isFinite(value) || value <= 0) {
			return sum;
		}

		return sum + Math.floor(value);
	}, 0);
}

export function mergeToolCallsByName(
	...toolCallMaps: Array<Record<string, number> | undefined>
): Record<string, number> {
	const merged: Record<string, number> = {};

	for (const toolCallMap of toolCallMaps) {
		if (!toolCallMap) {
			continue;
		}

		for (const [toolName, rawCount] of Object.entries(toolCallMap)) {
			if (!Number.isFinite(rawCount) || rawCount <= 0) {
				continue;
			}
			merged[toolName] = (merged[toolName] ?? 0) + Math.floor(rawCount);
		}
	}

	return merged;
}

function buildToolCallsByNameFromCounters(
	counters: ToolContext["counters"] | undefined
): Record<string, number> {
	const sendMessage = counters?.sendMessage ?? 0;
	const sendPrivateMessage = counters?.sendPrivateMessage ?? 0;
	const byName: Record<string, number> = {};

	if (sendMessage > 0) {
		byName.sendMessage = sendMessage;
	}
	if (sendPrivateMessage > 0) {
		byName.sendPrivateMessage = sendPrivateMessage;
	}

	return byName;
}

async function generateWithToolLoopAgent(input: {
	modelId: string;
	systemPrompt: string;
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	tools: ToolSet;
	prepareStep?: PrepareStepFunction<ToolSet>;
	stopWhen: Array<
		| ReturnType<typeof hasToolCall>
		| ReturnType<typeof stepCountIs>
		| ((params: { steps: ToolStepLike[] }) => boolean)
	>;
	abortSignal?: AbortSignal;
}): Promise<Awaited<ReturnType<ToolLoopAgent["generate"]>>> {
	const agent = new ToolLoopAgent({
		model: createModel(input.modelId),
		instructions: input.systemPrompt,
		tools: input.tools,
		prepareStep: input.prepareStep,
		toolChoice: "required",
		stopWhen: input.stopWhen,
		// Deterministic tool calls reduce accidental tool misuse in multi-step loops.
		temperature: 0,
	});

	return agent.generate({
		messages: input.messages,
		abortSignal: input.abortSignal,
	});
}

/**
 * Generate AI response using LLM with tools
 *
 * The AI must use tools for everything - there's no structured output.
 * This ensures the model actually calls sendMessage() to respond.
 *
 * Supports interruption via AbortSignal for cancellation.
 */
export async function generate(
	input: GenerationInput
): Promise<GenerationResult> {
	const {
		db,
		aiAgent,
		conversation,
		conversationHistory,
		visitorContext,
		mode,
		humanCommand,
		organizationId,
		websiteId,
		visitorId,
		triggerMessageId,
		triggerMessageCreatedAt,
		triggerSenderType,
		triggerVisibility,
		abortSignal,
		stopTyping,
		startTyping,
		onPublicMessageSent,
		allowPublicMessages,
		isEscalated,
		escalationReason,
		smartDecision,
		continuationHint,
		workflowRunId,
	} = input;
	const convId = conversation.id;

	const actionCapture = createActionCapture();

	// Build tool context for passing to tool execute functions
	// Counters are mutable objects that track message idempotency within this generation
	const toolContext: ToolContext = {
		db,
		conversation,
		conversationId: conversation.id,
		organizationId,
		websiteId,
		visitorId,
		aiAgentId: aiAgent.id,
		allowPublicMessages,
		triggerMessageId,
		triggerMessageCreatedAt,
		triggerSenderType,
		triggerVisibility,
		counters: {
			sendMessage: 0,
			sendPrivateMessage: 0,
		},
		// Callback to stop typing indicator just before a message is sent
		stopTyping,
		// Callback to start/restart typing indicator during delays between messages
		startTyping,
		// Callback to report successful public sends to the pipeline
		onPublicMessageSent,
		// Escalation state - prevents re-escalation
		isEscalated,
		// Workflow run ID for progress events
		workflowRunId,
		// Per-generation captured action store (concurrency-safe)
		actionCapture,
	};

	// Reset captured action before generation
	resetCapturedAction(actionCapture);
	const behaviorSettings = getBehaviorSettings(aiAgent);
	const maxToolInvocationsPerRun = clampToolInvocationBudget(
		behaviorSettings.maxToolInvocationsPerRun
	);

	// Get tools for this agent based on settings (with bound context)
	const tools = getToolsForGeneration(aiAgent, toolContext);
	if (!tools) {
		const toolCallsByName = buildToolCallsByNameFromCounters(
			toolContext.counters
		);
		return {
			decision: {
				action: "skip",
				reasoning: "No tools available for generation",
				confidence: 0,
			},
			toolCalls: {
				sendMessage: 0,
				sendPrivateMessage: 0,
			},
			toolCallsByName,
			totalToolCalls: getTotalToolCalls(toolCallsByName),
		};
	}

	const promptBundle = await resolvePromptBundle({
		db,
		aiAgent,
		mode,
	});
	const runtimeTools: ToolSet = {
		...tools,
	};
	const toolSkillDocuments = buildRuntimeSkillDocuments({
		enabledSkills: promptBundle.enabledSkills,
		runtimeToolIds: Object.keys(runtimeTools),
		maxCustomSkills: 0,
	});
	const customSkillCatalog = buildRuntimeCustomSkillCatalog({
		enabledSkills: promptBundle.enabledSkills,
	});
	const availableCustomSkills = customSkillCatalog.map((skill) => ({
		name: skill.fileName,
		description: skill.description,
	}));
	const loadedCustomSkillFileNames = new Set<string>();

	if (customSkillCatalog.length > 0) {
		runtimeTools[LOAD_SKILL_TOOL_NAME] = tool({
			description:
				"Load the full instructions for one custom skill from the Available Custom Skills list. Call this only when the current conversation clearly matches that skill.",
			inputSchema: z.object({
				skillName: z
					.string()
					.min(1)
					.describe(
						"Exact custom skill name from Available Custom Skills (for example: refunds.md)."
					),
			}),
			execute: async ({ skillName }) => {
				const matchedSkill = resolveCustomSkillFromCatalog({
					catalog: customSkillCatalog,
					skillName,
				});

				if (!matchedSkill) {
					return {
						success: false,
						error: `Unknown custom skill '${skillName}'. Available: ${customSkillCatalog.map((skill) => skill.fileName).join(", ")}`,
					};
				}

				loadedCustomSkillFileNames.add(matchedSkill.fileName);

				return {
					success: true,
					name: matchedSkill.fileName,
					description: matchedSkill.description,
					content: matchedSkill.content,
				};
			},
		});
	}

	const buildUsedCustomSkills = (): UsedCustomSkill[] =>
		buildUsedCustomSkillUsage({
			customSkillCatalog,
			loadedCustomSkillFileNames,
		});
	const runtimeFinishTools = getFinishToolsInToolset(runtimeTools);

	const buildResolvedSkillDocuments = (): PromptSkillDocument[] =>
		buildPromptSkillDocuments({
			toolSkillDocuments,
			customSkillCatalog,
			loadedCustomSkillFileNames,
		});

	const buildRuntimeSystemPrompt = () =>
		buildSystemPrompt({
			aiAgent,
			conversation,
			conversationHistory,
			visitorContext,
			mode,
			humanCommand,
			tools: runtimeTools,
			isEscalated,
			escalationReason,
			smartDecision,
			continuationHint,
			promptBundle,
			availableCustomSkills,
			selectedSkillDocuments: buildResolvedSkillDocuments(),
		});

	// Build dynamic system prompt with real-time context and tool instructions
	const systemPrompt = buildRuntimeSystemPrompt();
	const prepareStep: PrepareStepFunction<ToolSet> = ({ steps }) => {
		const nonFinishCallsUsed = countNonFinishToolCallsFromSteps(
			(steps as ToolStepLike[] | undefined) ?? []
		);
		const budgetExhausted = nonFinishCallsUsed >= maxToolInvocationsPerRun;

		if (budgetExhausted && runtimeFinishTools.length > 0) {
			return {
				system: buildRuntimeSystemPrompt(),
				activeTools: runtimeFinishTools,
			};
		}

		return {
			system: buildRuntimeSystemPrompt(),
		};
	};
	const mainStopConditions = buildStopConditions({
		toolBudgetCap: maxToolInvocationsPerRun,
	});

	// Format conversation history for LLM with multi-party prefixes
	const visitorName = visitorContext?.name ?? null;
	const messages = formatMessagesForLlm(conversationHistory, visitorName);
	const runtimeToolSkillNames = toolSkillDocuments.map((skill) => skill.name);
	const availableCustomSkillNames = availableCustomSkills.map(
		(skill) => skill.name
	);

	console.log(
		`[ai-agent:generate] conv=${convId} | model=${aiAgent.model} | messages=${messages.length} | mode=${mode} | tools=${Object.keys(runtimeTools).length} | toolBudget=${maxToolInvocationsPerRun} | toolSkills=${runtimeToolSkillNames.join(",") || "none"} | availableCustomSkills=${availableCustomSkillNames.join(",") || "none"}`
	);

	// Check for potential prompt injection in the latest visitor message (for monitoring)
	const latestVisitorMessage = conversationHistory
		.filter((m) => m.senderType === "visitor")
		.pop();
	if (latestVisitorMessage) {
		const injectionResult = detectPromptInjection(latestVisitorMessage.content);
		if (injectionResult.detected) {
			logInjectionAttempt(
				convId,
				injectionResult,
				latestVisitorMessage.content
			);
			// Note: We don't block the message - the AI handles it via security prompt
			// The logging is for monitoring and improving detection patterns
		}
	}

	// In development, log the full system prompt for debugging
	if (env.NODE_ENV === "development") {
		console.log(
			`[ai-agent:generate] conv=${convId} | FULL SYSTEM PROMPT:\n${"=".repeat(80)}\n${systemPrompt}\n${"=".repeat(80)}`
		);
	} else {
		console.log(
			`[ai-agent:generate] conv=${convId} | System prompt (${systemPrompt.length} chars): "${systemPrompt.slice(0, 200).replace(/\n/g, " ")}..."`
		);
	}

	// Generate using tools-only approach (no structured output)
	// The AI MUST call tools:
	// 1. sendMessage() to respond to visitor
	// 2. respond()/escalate()/resolve() to signal completion
	//
	// Key configurations:
	// - toolChoice: 'required' forces the model to call tools (can't skip them)
	// - stopWhen: stops on finish action tools, non-finish tool budget exhaustion,
	//   or an emergency step guard (cap + 2)
	// - abortSignal: allows interruption when new message arrives
	let result: Awaited<ReturnType<typeof generateWithToolLoopAgent>>;
	try {
		result = await generateWithToolLoopAgent({
			modelId: aiAgent.model,
			systemPrompt,
			messages,
			tools: runtimeTools,
			prepareStep,
			stopWhen: mainStopConditions,
			abortSignal,
		});
	} catch (error) {
		// Handle abort gracefully - this means a new message arrived
		if (error instanceof Error && error.name === "AbortError") {
			console.log(
				`[ai-agent:generate] conv=${convId} | Generation aborted - new message arrived`
			);
			const toolCallsByName = buildToolCallsByNameFromCounters(
				toolContext.counters
			);
			return {
				decision: {
					action: "skip" as const,
					reasoning: "Generation aborted due to new message arriving",
					confidence: 1,
				},
				aborted: true,
				toolCalls: {
					sendMessage: toolContext.counters?.sendMessage ?? 0,
					sendPrivateMessage: toolContext.counters?.sendPrivateMessage ?? 0,
				},
				toolCallsByName,
				totalToolCalls: getTotalToolCalls(toolCallsByName),
				usedCustomSkills: buildUsedCustomSkills(),
			};
		}
		// Re-throw other errors
		throw error;
	}

	// Log tool call information for debugging.
	// Merge SDK-reported tool calls with authoritative local counters to avoid
	// fallback loops when SDK step accounting is incomplete.
	const allToolCalls =
		result.steps?.flatMap((step) => step.toolCalls ?? []) ?? [];
	const sdkToolCallsByName = buildToolCallsByName(allToolCalls);
	const counterToolCallsByName = buildToolCallsByNameFromCounters(
		toolContext.counters
	);
	const toolCallsByName = mergeToolCallsByName(
		sdkToolCallsByName,
		counterToolCallsByName
	);
	const totalToolCalls = getTotalToolCalls(toolCallsByName);
	const nonFinishToolCalls = getNonFinishToolCallCount(toolCallsByName);
	const remainingNonFinishBudget = Math.max(
		0,
		maxToolInvocationsPerRun - nonFinishToolCalls
	);
	const sendMessageCallCount = toolCallsByName.sendMessage ?? 0;
	const sendPrivateMessageCallCount = toolCallsByName.sendPrivateMessage ?? 0;
	const actionCalls = allToolCalls.filter((tc) =>
		tc.toolName ? isFinishToolName(tc.toolName) : false
	);

	console.log(
		`[ai-agent:generate] conv=${convId} | Steps: ${result.steps?.length ?? 0} | Tool calls: sendMessage=${sendMessageCallCount}, sendPrivateMessage=${sendPrivateMessageCallCount}, action=${actionCalls.length}, nonFinish=${nonFinishToolCalls}/${maxToolInvocationsPerRun}`
	);

	// Get the captured action from action tools
	const capturedAction = getCapturedAction(actionCapture);

	const requiresMessage = Boolean(
		capturedAction &&
			["respond", "escalate", "resolve"].includes(capturedAction.action)
	);
	const missingRequiredMessage = requiresMessage && sendMessageCallCount === 0;
	const missingAction = !capturedAction;

	if (
		toolContext.allowPublicMessages &&
		(missingAction || missingRequiredMessage)
	) {
		if (remainingNonFinishBudget === 0) {
			if (missingAction && sendMessageCallCount > 0) {
				console.warn(
					`[ai-agent:generate] conv=${convId} | Budget exhausted with public message already sent; synthesizing respond action`
				);
				return {
					decision: {
						action: "respond" as const,
						reasoning:
							"Tool budget exhausted after sending a public message; synthesized terminal respond action.",
						confidence: 0.6,
					},
					usage: result.usage
						? {
								inputTokens: result.usage.inputTokens ?? 0,
								outputTokens: result.usage.outputTokens ?? 0,
								totalTokens: result.usage.totalTokens ?? 0,
							}
						: undefined,
					toolCalls: {
						sendMessage: sendMessageCallCount,
						sendPrivateMessage: sendPrivateMessageCallCount,
					},
					toolCallsByName,
					totalToolCalls,
					usedCustomSkills: buildUsedCustomSkills(),
				};
			}

			console.warn(
				`[ai-agent:generate] conv=${convId} | Budget exhausted before terminal public response; returning safe skip`
			);
			return {
				decision: {
					action: "skip" as const,
					reasoning:
						"Tool budget exhausted before producing a complete public response. Skipping to avoid unsafe fallback behavior.",
					confidence: 1,
				},
				usage: result.usage
					? {
							inputTokens: result.usage.inputTokens ?? 0,
							outputTokens: result.usage.outputTokens ?? 0,
							totalTokens: result.usage.totalTokens ?? 0,
						}
					: undefined,
				toolCalls: {
					sendMessage: sendMessageCallCount,
					sendPrivateMessage: sendPrivateMessageCallCount,
				},
				toolCallsByName,
				totalToolCalls,
				usedCustomSkills: buildUsedCustomSkills(),
			};
		}

		const repairReason = missingAction
			? "missing_action"
			: "missing_send_message";
		console.warn(
			`[ai-agent:generate] conv=${convId} | Repair triggered (${repairReason}) | remainingBudget=${remainingNonFinishBudget}`
		);

		const repairTools = getRepairTools(toolContext);
		if (repairTools) {
			const repairFinishTools = getFinishToolsInToolset(repairTools);

			// Reset captured action before repair generation
			resetCapturedAction(actionCapture);

			const repairPrompt = `${buildSystemPrompt({
				aiAgent,
				conversation,
				conversationHistory,
				visitorContext,
				mode,
				humanCommand,
				tools: repairTools,
				isEscalated,
				escalationReason,
				smartDecision,
				continuationHint,
				promptBundle,
				availableCustomSkills,
				selectedSkillDocuments: buildResolvedSkillDocuments(),
			})}\n\n## Repair Mode\n\nYou must complete this turn using ONLY these tools:\n- sendMessage(): send a short, safe, helpful reply to the visitor\n- respond(): finish the turn\n\nRules:\n- Call sendMessage() exactly once\n- Call respond() immediately after sendMessage()\n- Do not call any other tools`;

			let repairResult: Awaited<ReturnType<typeof generateWithToolLoopAgent>>;
			try {
				repairResult = await generateWithToolLoopAgent({
					modelId: aiAgent.model,
					systemPrompt: repairPrompt,
					messages,
					tools: repairTools,
					prepareStep: ({ steps }) => {
						const repairCallsUsed = countNonFinishToolCallsFromSteps(
							(steps as ToolStepLike[] | undefined) ?? []
						);
						const totalUsed = nonFinishToolCalls + repairCallsUsed;
						const budgetExhausted = totalUsed >= maxToolInvocationsPerRun;
						if (budgetExhausted && repairFinishTools.length > 0) {
							return {
								system: repairPrompt,
								activeTools: repairFinishTools,
							};
						}
						return {
							system: repairPrompt,
						};
					},
					stopWhen: buildStopConditions({
						toolBudgetCap: maxToolInvocationsPerRun,
						usedNonFinishCallsOffset: nonFinishToolCalls,
						finishToolNames: FINISH_TOOL_NAMES,
					}),
					abortSignal,
				});
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					console.log(
						`[ai-agent:generate] conv=${convId} | Repair aborted - new message arrived`
					);
					const repairAbortToolCallsByName = buildToolCallsByNameFromCounters(
						toolContext.counters
					);
					const combinedRepairAbortToolCallsByName = mergeToolCallsByName(
						toolCallsByName,
						repairAbortToolCallsByName
					);
					return {
						decision: {
							action: "skip" as const,
							reasoning: "Repair aborted due to new message arriving",
							confidence: 1,
						},
						aborted: true,
						toolCalls: {
							sendMessage: combinedRepairAbortToolCallsByName.sendMessage ?? 0,
							sendPrivateMessage:
								combinedRepairAbortToolCallsByName.sendPrivateMessage ?? 0,
						},
						toolCallsByName: combinedRepairAbortToolCallsByName,
						totalToolCalls: getTotalToolCalls(
							combinedRepairAbortToolCallsByName
						),
						usedCustomSkills: buildUsedCustomSkills(),
					};
				}
				throw error;
			}

			const repairToolCalls =
				repairResult.steps?.flatMap((step) => step.toolCalls ?? []) ?? [];
			const repairToolCallsByName = buildToolCallsByName(repairToolCalls);
			const repairCounterToolCallsByName = buildToolCallsByNameFromCounters(
				toolContext.counters
			);
			const combinedRepairToolCallsByName = mergeToolCallsByName(
				toolCallsByName,
				repairToolCallsByName,
				repairCounterToolCallsByName
			);
			const repairTotalToolCalls = getTotalToolCalls(
				combinedRepairToolCallsByName
			);
			const repairSendMessageCalls =
				combinedRepairToolCallsByName.sendMessage ?? 0;
			const repairSendPrivateMessageCalls =
				combinedRepairToolCallsByName.sendPrivateMessage ?? 0;

			const repairAction = getCapturedAction(actionCapture);
			const repairSucceeded = Boolean(
				repairAction &&
					repairAction.action === "respond" &&
					repairSendMessageCalls > 0
			);

			if (repairSucceeded && repairAction) {
				console.log(`[ai-agent:generate] conv=${convId} | Repair succeeded`);
				return {
					decision: repairAction,
					usage: repairResult.usage
						? {
								inputTokens: repairResult.usage.inputTokens ?? 0,
								outputTokens: repairResult.usage.outputTokens ?? 0,
								totalTokens: repairResult.usage.totalTokens ?? 0,
							}
						: undefined,
					toolCalls: {
						sendMessage: repairSendMessageCalls,
						sendPrivateMessage: repairSendPrivateMessageCalls,
					},
					toolCallsByName: combinedRepairToolCallsByName,
					totalToolCalls: repairTotalToolCalls,
					usedCustomSkills: buildUsedCustomSkills(),
				};
			}

			console.warn(
				`[ai-agent:generate] conv=${convId} | Repair failed, sending fallback`
			);
			return {
				decision: {
					action: "respond" as const,
					reasoning: "Repair attempt failed to produce a tool-based response",
					confidence: 0,
				},
				needsFallbackMessage: true,
				usage: repairResult.usage
					? {
							inputTokens: repairResult.usage.inputTokens ?? 0,
							outputTokens: repairResult.usage.outputTokens ?? 0,
							totalTokens: repairResult.usage.totalTokens ?? 0,
						}
					: undefined,
				toolCalls: {
					sendMessage: repairSendMessageCalls,
					sendPrivateMessage: repairSendPrivateMessageCalls,
				},
				toolCallsByName: combinedRepairToolCallsByName,
				totalToolCalls: repairTotalToolCalls,
				usedCustomSkills: buildUsedCustomSkills(),
			};
		}
	}

	// Validate that we got an action
	if (!capturedAction) {
		console.error(
			`[ai-agent:generate] conv=${convId} | No action tool called! text="${result.text?.slice(0, 200)}"`
		);

		// Return a safe fallback decision
		return {
			decision: {
				action: "skip" as const,
				reasoning:
					"AI did not call an action tool (respond/escalate/resolve/skip/markSpam/wait). This may indicate a model compatibility issue.",
				confidence: 0,
			},
			usage: result.usage
				? {
						inputTokens: result.usage.inputTokens ?? 0,
						outputTokens: result.usage.outputTokens ?? 0,
						totalTokens: result.usage.totalTokens ?? 0,
					}
				: undefined,
			toolCalls: {
				sendMessage: sendMessageCallCount,
				sendPrivateMessage: sendPrivateMessageCallCount,
			},
			toolCallsByName,
			totalToolCalls,
			usedCustomSkills: buildUsedCustomSkills(),
		};
	}

	// Warn if no sendMessage was called for respond/escalate/resolve actions
	if (requiresMessage && sendMessageCallCount === 0) {
		console.warn(
			`[ai-agent:generate] conv=${convId} | WARNING: Action "${capturedAction.action}" without sendMessage! The visitor won't see a response.`
		);
	}

	// Extract usage data from AI SDK response
	const usage = result.usage;
	console.log(
		`[ai-agent:generate] conv=${convId} | AI decided: action=${capturedAction.action} | reasoning="${(capturedAction.reasoning ?? "").slice(0, 100)}${(capturedAction.reasoning ?? "").length > 100 ? "..." : ""}"`
	);

	if (usage) {
		console.log(
			`[ai-agent:generate] conv=${convId} | Tokens: input=${usage.inputTokens ?? 0} output=${usage.outputTokens ?? 0} total=${usage.totalTokens ?? 0}`
		);
	}

	return {
		decision: capturedAction,
		usage: usage
			? {
					inputTokens: usage.inputTokens ?? 0,
					outputTokens: usage.outputTokens ?? 0,
					totalTokens: usage.totalTokens ?? 0,
				}
			: undefined,
		toolCalls: {
			sendMessage: sendMessageCallCount,
			sendPrivateMessage: sendPrivateMessageCallCount,
		},
		toolCallsByName,
		totalToolCalls,
		usedCustomSkills: buildUsedCustomSkills(),
	};
}

/**
 * Build message prefix based on sender type and visibility
 *
 * Prefix Protocol:
 * - [VISITOR] or [VISITOR:name] for visitor messages
 * - [TEAM:name] for human agent messages
 * - [AI] for AI agent messages
 * - [PRIVATE] prefix for private/internal messages
 *
 * This helps the AI reliably understand who is speaking and
 * which messages are internal team communications.
 */
function buildMessagePrefix(
	msg: RoleAwareMessage,
	visitorName: string | null
): string {
	const isPrivate = msg.visibility === "private";
	const privatePrefix = isPrivate ? "[PRIVATE]" : "";

	switch (msg.senderType) {
		case "visitor":
			// Visitor messages are always public
			return visitorName ? `[VISITOR:${visitorName}]` : "[VISITOR]";

		case "human_agent": {
			const humanName = msg.senderName || "Team Member";
			return `${privatePrefix}[TEAM:${humanName}]`;
		}

		case "ai_agent":
			return `${privatePrefix}[AI]`;

		default:
			return "";
	}
}

/**
 * Format role-aware messages for LLM consumption
 *
 * Uses AI SDK message format with prefixed content for multi-party context:
 * - Visitor messages → role: "user" with [VISITOR] or [VISITOR:name] prefix
 * - Human/AI messages → role: "assistant" with [TEAM:name] or [AI] prefix
 * - Private messages get [PRIVATE] prefix
 */
function formatMessagesForLlm(
	messages: RoleAwareMessage[],
	visitorName: string | null
): Array<{ role: "user" | "assistant"; content: string }> {
	return messages.map((msg) => {
		// Visitor messages are "user", everything else is "assistant"
		const role = msg.senderType === "visitor" ? "user" : "assistant";

		// Build prefix based on sender type and visibility
		const prefix = buildMessagePrefix(msg, visitorName);

		// Combine prefix with content
		const content = prefix ? `${prefix} ${msg.content}` : msg.content;

		return { role, content };
	});
}
