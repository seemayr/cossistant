/**
 * System Prompt Builder
 *
 * Builds dynamic system prompts based on context and settings.
 */

import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { ToolSet } from "ai";
import type { RoleAwareMessage } from "../context/conversation";
import {
	formatConversationMetaForPrompt,
	getConversationMeta,
} from "../context/conversation-meta";
import {
	formatTemporalContextForPrompt,
	getTemporalContext,
} from "../context/temporal";
import type { VisitorContext } from "../context/visitor";
import { formatVisitorContextForPrompt } from "../context/visitor";
import type { ResponseMode } from "../pipeline/2-decision";
import { getBehaviorSettings } from "../settings";
import { buildBehaviorInstructions } from "./instructions";
import { CORE_SECURITY_PROMPT, SECURITY_REMINDER } from "./security";
import { PROMPT_TEMPLATES } from "./templates";

type BuildPromptInput = {
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	conversationHistory: RoleAwareMessage[];
	visitorContext: VisitorContext | null;
	mode: ResponseMode;
	humanCommand: string | null;
	tools?: ToolSet;
};

/**
 * Build the complete system prompt for the AI agent
 *
 * Layered Architecture:
 * - Layer 0: Core Security (immutable) - Multi-party context, private info protection
 * - Layer 1: Base Prompt (user-configurable) - Agent personality and role
 * - Layer 2: Dynamic Context (auto-generated) - Visitor, tools, behavior
 * - Layer 3: Security Reminder (immutable) - Final reinforcement
 *
 * The security layers cannot be overridden by user configuration.
 */
export function buildSystemPrompt(input: BuildPromptInput): string {
	const {
		aiAgent,
		conversation,
		conversationHistory,
		visitorContext,
		mode,
		humanCommand,
		tools,
	} = input;
	const settings = getBehaviorSettings(aiAgent);

	const parts: string[] = [];

	// =========================================================================
	// LAYER 0: Core Security (immutable - always first)
	// =========================================================================
	parts.push(CORE_SECURITY_PROMPT);

	// =========================================================================
	// LAYER 1: Base Prompt (user-configurable)
	// =========================================================================
	parts.push(aiAgent.basePrompt);

	// =========================================================================
	// LAYER 2: Dynamic Context (auto-generated)
	// =========================================================================

	// Add real-time context (visitor + temporal + conversation meta)
	const realtimeContext = buildRealtimeContext(
		visitorContext,
		conversation,
		conversationHistory
	);
	if (realtimeContext) {
		parts.push(realtimeContext);
	}

	// Add tool instructions if tools are available
	if (tools && Object.keys(tools).length > 0) {
		parts.push(buildToolInstructions(tools));
	}

	// Add structured output instructions
	parts.push(PROMPT_TEMPLATES.STRUCTURED_OUTPUT);

	// Add behavior instructions based on settings
	parts.push(buildBehaviorInstructions(settings, mode));

	// Add mode-specific instructions
	if (mode === "respond_to_command" && humanCommand) {
		parts.push(buildCommandModeInstructions(humanCommand));
	}

	// =========================================================================
	// LAYER 3: Security Reminder (immutable - always last)
	// =========================================================================
	parts.push(SECURITY_REMINDER);

	return parts.join("\n\n");
}

/**
 * Build real-time context section
 */
function buildRealtimeContext(
	visitorContext: VisitorContext | null,
	conversation: ConversationSelect,
	conversationHistory: RoleAwareMessage[]
): string {
	const visitorPart = formatVisitorContextForPrompt(visitorContext);

	// Get temporal context (time, date, greeting)
	const temporalContext = getTemporalContext(visitorContext?.timezone ?? null);
	const temporalPart = formatTemporalContextForPrompt(temporalContext);

	// Get conversation meta (duration, message count)
	const conversationMeta = getConversationMeta(
		conversation,
		conversationHistory
	);
	const metaPart = formatConversationMetaForPrompt(conversationMeta);

	// Build the full context section
	const contextParts = [visitorPart, temporalPart, metaPart].filter(Boolean);

	if (contextParts.length === 0) {
		return "";
	}

	return PROMPT_TEMPLATES.REALTIME_CONTEXT.replace(
		"{visitorContext}",
		visitorPart || ""
	)
		.replace("{temporalContext}", temporalPart)
		.replace("{conversationMeta}", metaPart);
}

/**
 * Build tool instructions section
 */
function buildToolInstructions(tools: ToolSet): string {
	const toolDescriptions = Object.entries(tools)
		.map(([name, t]) => {
			const description =
				"description" in t ? (t.description as string) : "No description";
			return `- **${name}**: ${description}`;
		})
		.join("\n");

	return PROMPT_TEMPLATES.TOOLS_AVAILABLE.replace(
		"{toolList}",
		toolDescriptions
	);
}

/**
 * Build instructions for command mode
 */
function buildCommandModeInstructions(command: string): string {
	return `## Human Agent Command

A human support agent has given you a command. You should follow this instruction:

"${command}"

Important:
- This is a request from a teammate, not a visitor
- Your response should help the support team
- Use "internal_note" action unless the command specifically asks you to respond to the visitor
- Be concise and actionable`;
}
