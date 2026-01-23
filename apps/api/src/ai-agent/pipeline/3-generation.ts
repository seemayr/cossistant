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
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, hasToolCall, stepCountIs } from "ai";
import {
	detectPromptInjection,
	logInjectionAttempt,
} from "../analysis/injection";
import type { RoleAwareMessage } from "../context/conversation";
import type { VisitorContext } from "../context/visitor";
import type { AiDecision } from "../output/schemas";
import { buildSystemPrompt } from "../prompts/system";
import {
	getCapturedAction,
	getToolsForGeneration,
	resetCapturedAction,
	type ToolContext,
} from "../tools";
import type { ResponseMode } from "./2-decision";

export type GenerationResult = {
	decision: AiDecision;
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
};

/**
 * Generate AI response using LLM with tools
 *
 * The AI must use tools for everything - there's no structured output.
 * This ensures the model actually calls sendMessage() to respond.
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
	} = input;
	const convId = conversation.id;

	// Build tool context for passing to tool execute functions
	const toolContext: ToolContext = {
		db,
		conversation,
		conversationId: conversation.id,
		organizationId,
		websiteId,
		visitorId,
		aiAgentId: aiAgent.id,
		triggerMessageId,
	};

	// Reset captured action before generation
	resetCapturedAction();

	// Get tools for this agent based on settings (with bound context)
	const tools = getToolsForGeneration(aiAgent, toolContext);

	// Build dynamic system prompt with real-time context and tool instructions
	const systemPrompt = buildSystemPrompt({
		aiAgent,
		conversation,
		conversationHistory,
		visitorContext,
		mode,
		humanCommand,
		tools,
	});

	// Format conversation history for LLM with multi-party prefixes
	const visitorName = visitorContext?.name ?? null;
	const messages = formatMessagesForLlm(conversationHistory, visitorName);

	console.log(
		`[ai-agent:generate] conv=${convId} | model=${aiAgent.model} | messages=${messages.length} | mode=${mode} | tools=${tools ? Object.keys(tools).length : 0}`
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

	// Get OpenRouter client
	const openrouter = createOpenRouter({
		apiKey: env.OPENROUTER_API_KEY,
	});

	// Generate using tools-only approach (no structured output)
	// The AI MUST call tools:
	// 1. sendMessage() to respond to visitor
	// 2. respond()/escalate()/resolve() to signal completion
	//
	// Key configurations:
	// - toolChoice: 'required' forces the model to call tools (can't skip them)
	// - stopWhen: stops generation when an action tool is called OR after 10 steps
	const result = await generateText({
		model: openrouter.chat(aiAgent.model),
		tools,
		toolChoice: "required", // Force the model to call tools
		stopWhen: [
			// Stop when any action tool is called
			hasToolCall("respond"),
			hasToolCall("escalate"),
			hasToolCall("resolve"),
			hasToolCall("markSpam"),
			hasToolCall("skip"),
			// Safety limit: stop after 10 steps regardless
			stepCountIs(10),
		],
		system: systemPrompt,
		messages,
		// Use temperature 0 for deterministic tool calling (AI SDK best practice)
		// This reduces randomness and improves tool call reliability
		temperature: 0,
	});

	// Log tool call information for debugging
	const allToolCalls =
		result.steps?.flatMap((step) => step.toolCalls ?? []) ?? [];
	const sendMessageCalls = allToolCalls.filter(
		(tc) => tc.toolName === "sendMessage"
	);
	const sendPrivateMessageCalls = allToolCalls.filter(
		(tc) => tc.toolName === "sendPrivateMessage"
	);
	const actionCalls = allToolCalls.filter((tc) =>
		["respond", "escalate", "resolve", "markSpam", "skip"].includes(tc.toolName)
	);

	console.log(
		`[ai-agent:generate] conv=${convId} | Steps: ${result.steps?.length ?? 0} | Tool calls: sendMessage=${sendMessageCalls.length}, sendPrivateMessage=${sendPrivateMessageCalls.length}, action=${actionCalls.length}`
	);

	// Get the captured action from action tools
	const capturedAction = getCapturedAction();

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
					"AI did not call an action tool (respond/escalate/resolve). This may indicate a model compatibility issue.",
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
				sendMessage: sendMessageCalls.length,
				sendPrivateMessage: sendPrivateMessageCalls.length,
			},
		};
	}

	// Warn if no sendMessage was called for respond/escalate/resolve actions
	const requiresMessage = ["respond", "escalate", "resolve"].includes(
		capturedAction.action
	);
	if (requiresMessage && sendMessageCalls.length === 0) {
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
			sendMessage: sendMessageCalls.length,
			sendPrivateMessage: sendPrivateMessageCalls.length,
		},
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
