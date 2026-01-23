/**
 * Pipeline Step 3: Generation
 *
 * This step generates the AI response using the LLM with structured output.
 * It builds the prompt dynamically based on context and behavior settings.
 *
 * Responsibilities:
 * - Build dynamic system prompt
 * - Format conversation history for LLM
 * - Call LLM with structured output schema
 * - Parse and validate AI decision
 */

import type { Database } from "@api/db";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { env } from "@api/env";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output, stepCountIs } from "ai";
import {
	detectPromptInjection,
	logInjectionAttempt,
} from "../analysis/injection";
import type { RoleAwareMessage } from "../context/conversation";
import type { VisitorContext } from "../context/visitor";
import { type AiDecision, aiDecisionSchema } from "../output/schemas";
import { buildSystemPrompt } from "../prompts/system";
import { getToolsForGeneration, type ToolContext } from "../tools";
import type { ResponseMode } from "./2-decision";

export type GenerationResult = {
	decision: AiDecision;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
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
 * Generate AI response using LLM with structured output
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

	// Generate structured output using AI SDK v6 pattern
	// Using generateText + Output.object instead of deprecated generateObject
	//
	// IMPORTANT: When tools are enabled, we use stopWhen to ensure the AI generates
	// a final text response after tool execution. This prevents the AI from going
	// silent after calling a tool. The step count of 5 allows for:
	// - Step 1: Initial response (may include tool call)
	// - Step 2: Tool execution result
	// - Step 3: Follow-up response (may include another tool call)
	// - Step 4: Another tool execution result
	// - Step 5: Final structured output generation
	const result = await generateText({
		model: openrouter.chat(aiAgent.model),
		output: Output.object({
			schema: aiDecisionSchema,
		}),
		tools,
		// Pass tool context via experimental_context for tool execute functions
		experimental_context: toolContext,
		// stopWhen ensures multi-step execution when tools are used, so the AI
		// generates a response after tool calls instead of going silent
		stopWhen: tools ? stepCountIs(5) : undefined,
		system: systemPrompt,
		messages,
		temperature: aiAgent.temperature ?? 0.7,
	});

	// Extract the structured output
	const decision = result.output;

	// Validate that we got a proper decision
	if (!decision) {
		console.error(
			`[ai-agent:generate] conv=${convId} | Structured output failed | text="${result.text?.slice(0, 200)}"`
		);
		// Return a safe fallback decision with a visitor message to avoid going silent
		return {
			decision: {
				action: "skip" as const,
				visitorMessage:
					"I'm having a moment - let me get back to you shortly, or a team member will assist you.",
				reasoning:
					"Failed to generate structured output from model. Raw response logged for debugging.",
				confidence: 0,
			},
			usage: result.usage
				? {
						inputTokens: result.usage.inputTokens ?? 0,
						outputTokens: result.usage.outputTokens ?? 0,
						totalTokens: result.usage.totalTokens ?? 0,
					}
				: undefined,
		};
	}

	// Extract usage data from AI SDK response
	const usage = result.usage;
	console.log(
		`[ai-agent:generate] conv=${convId} | AI decided: action=${decision.action} | reasoning="${(decision.reasoning ?? "").slice(0, 100)}${(decision.reasoning ?? "").length > 100 ? "..." : ""}"`
	);

	// Log visitor message
	const visitorMsg = decision.visitorMessage || "";
	if (visitorMsg) {
		console.log(
			`[ai-agent:generate] conv=${convId} | Visitor message (${visitorMsg.length} chars): "${visitorMsg.slice(0, 100)}${visitorMsg.length > 100 ? "..." : ""}"`
		);
	}

	// Log internal note if present
	if (decision.internalNote) {
		console.log(
			`[ai-agent:generate] conv=${convId} | Internal note (${decision.internalNote.length} chars): "${decision.internalNote.slice(0, 100)}${decision.internalNote.length > 100 ? "..." : ""}"`
		);
	}
	if (usage) {
		console.log(
			`[ai-agent:generate] conv=${convId} | Tokens: input=${usage.inputTokens ?? 0} output=${usage.outputTokens ?? 0} total=${usage.totalTokens ?? 0}`
		);
	}

	return {
		decision,
		usage: usage
			? {
					inputTokens: usage.inputTokens ?? 0,
					outputTokens: usage.outputTokens ?? 0,
					totalTokens: usage.totalTokens ?? 0,
				}
			: undefined,
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
