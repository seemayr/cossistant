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
import type { ContinuationHint } from "../pipeline/1b-continuation-gate";
import type { ResponseMode } from "../pipeline/2-decision";
import type { SmartDecisionResult } from "../pipeline/2a-smart-decision";
import { getBehaviorSettings } from "../settings";
import { buildBehaviorInstructions } from "./instructions";
import type { ResolvedPromptBundle } from "./resolver";
import { CORE_SECURITY_PROMPT, SECURITY_REMINDER } from "./security";
import { PROMPT_TEMPLATES } from "./templates";

export type PromptSkillDocument = {
	name: string;
	content: string;
};

export type AvailableSkillCatalogEntry = {
	name: string;
	summary: string;
};

type BuildPromptInput = {
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	conversationHistory: RoleAwareMessage[];
	visitorContext: VisitorContext | null;
	mode: ResponseMode;
	humanCommand: string | null;
	tools?: ToolSet;
	/** Whether conversation is currently escalated */
	isEscalated?: boolean;
	/** Reason for escalation if escalated */
	escalationReason?: string | null;
	/** Smart decision result if AI was used to decide */
	smartDecision?: SmartDecisionResult;
	/** Continuation hint when this run should only add incremental information */
	continuationHint?: ContinuationHint;
	/** Prompt documents resolved from DB with fallbacks */
	promptBundle?: ResolvedPromptBundle;
	/** Subset of enabled/runtime skills selected for this run */
	selectedSkillDocuments?: PromptSkillDocument[];
	/** Optional catalog of loadable skills available this run */
	availableSkillCatalog?: AvailableSkillCatalogEntry[];
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
		isEscalated,
		escalationReason,
		smartDecision,
		continuationHint,
		promptBundle,
		selectedSkillDocuments,
		availableSkillCatalog,
	} = input;
	const settings = getBehaviorSettings(aiAgent);
	const coreDocuments = promptBundle?.coreDocuments;

	const securityDocument = getCoreDocumentContent(
		coreDocuments?.["security.md"]?.content,
		CORE_SECURITY_PROMPT
	);
	const agentDocument = getCoreDocumentContent(
		coreDocuments?.["agent.md"]?.content,
		aiAgent.basePrompt
	);
	const behaviourDocument = getCoreDocumentContent(
		coreDocuments?.["behaviour.md"]?.content,
		buildBehaviorInstructions(settings, mode)
	);
	const participationDocument = getCoreDocumentContent(
		coreDocuments?.["participation.md"]?.content,
		PROMPT_TEMPLATES.PARTICIPATION_POLICY
	);
	const groundingDocument = getCoreDocumentContent(
		coreDocuments?.["grounding.md"]?.content,
		mode === "respond_to_visitor" ? PROMPT_TEMPLATES.GROUNDING_INSTRUCTIONS : ""
	);
	const capabilitiesDocument = getCoreDocumentContent(
		coreDocuments?.["capabilities.md"]?.content,
		""
	);

	const parts: string[] = [];

	// =========================================================================
	// LAYER 0: Core Security (immutable - always first)
	// =========================================================================
	parts.push(securityDocument);

	// =========================================================================
	// LAYER 1: Base Prompt (user-configurable)
	// =========================================================================
	parts.push(agentDocument);

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

	// Ask for identification only when visitor isn't identified and we're responding
	if (visitorContext && visitorContext.isIdentified === false) {
		const conversationMeta = getConversationMeta(
			conversation,
			conversationHistory
		);
		const visitorMessageCount = conversationMeta.visitorMessageCount;
		const policy = settings.visitorContactPolicy ?? "only_if_needed";

		let identificationPrompt: string | null = null;

		if (mode === "respond_to_visitor") {
			switch (policy) {
				case "ask_early":
					identificationPrompt = PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_EARLY;
					break;
				case "ask_after_time":
					if (visitorMessageCount >= 2) {
						identificationPrompt =
							PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_DELAYED;
					}
					break;
				default:
					identificationPrompt = PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_SOFT;
					break;
			}
		}

		if (identificationPrompt) {
			parts.push(identificationPrompt);
		}
	}

	// Add grounding instructions to prevent hallucinations
	// Only needed when responding to the visitor
	if (mode === "respond_to_visitor" && groundingDocument) {
		parts.push(groundingDocument);
	}

	if (participationDocument) {
		parts.push(participationDocument);
	}

	// Add structured output instructions
	parts.push(PROMPT_TEMPLATES.STRUCTURED_OUTPUT);

	if (behaviourDocument) {
		parts.push(behaviourDocument);
	}

	if (capabilitiesDocument) {
		parts.push(capabilitiesDocument);
	}

	const availableSkillCatalogSection = buildAvailableSkillCatalogSection(
		availableSkillCatalog
	);
	if (availableSkillCatalogSection) {
		parts.push(availableSkillCatalogSection);
	}

	if (availableSkillCatalog && availableSkillCatalog.length > 0) {
		parts.push(buildRuntimeSkillLoaderInstructions());
	}

	const selectedSkillsSection = buildSelectedSkillsSection(
		selectedSkillDocuments
	);
	if (selectedSkillsSection) {
		parts.push(selectedSkillsSection);
	}

	// Add command instructions when a human agent provided a command
	if (humanCommand) {
		parts.push(buildCommandModeInstructions(humanCommand));
	}

	// Add escalation context if conversation is escalated
	// This is CRITICAL - tells AI to continue helping but not re-escalate
	if (isEscalated) {
		const escalatedContext = PROMPT_TEMPLATES.ESCALATED_CONTEXT.replace(
			"{escalationReason}",
			escalationReason || "Human support requested"
		);
		parts.push(escalatedContext);
	}

	// Add smart decision context if AI decided to respond with human present
	// This gives the AI context about why it's joining the conversation
	if (smartDecision && smartDecision.intent === "respond") {
		const smartContext = PROMPT_TEMPLATES.SMART_DECISION_CONTEXT.replace(
			"{decisionReason}",
			smartDecision.reasoning
		);
		parts.push(smartContext);
	}

	if (continuationHint) {
		const continuationContext = PROMPT_TEMPLATES.CONTINUATION_CONTEXT.replace(
			"{latestAiMessage}",
			continuationHint.latestAiMessageText
		)
			.replace("{continuationReason}", continuationHint.reason)
			.replace(
				"{deltaHint}",
				continuationHint.deltaHint ??
					"Only add missing details required to move the conversation forward."
			)
			.replace("{continuationConfidence}", continuationHint.confidence);
		parts.push(continuationContext);
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
- Use the right channel for the request:
  - If the teammate asks you to inform/reply/update the visitor, use sendMessage
  - If the teammate asks for internal analysis or handoff notes, use sendPrivateMessage
  - You may use both when useful (public reply + private handoff note)
- Be concise and actionable`;
}

function getCoreDocumentContent(
	value: string | undefined,
	fallback: string
): string {
	const trimmed = value?.trim();
	if (trimmed) {
		return trimmed;
	}

	return fallback.trim();
}

function buildSelectedSkillsSection(
	selectedSkillDocuments: PromptSkillDocument[] | undefined
): string {
	if (!selectedSkillDocuments || selectedSkillDocuments.length === 0) {
		return "";
	}

	const sections = selectedSkillDocuments.map(
		(skill) => `### ${skill.name}\n\n${skill.content.trim()}`
	);

	return [
		"## Selected Skills (Optional Guidance)",
		"These skills were selected for this turn. Use them only if relevant. You may use none, one, or several skills.",
		sections.join("\n\n"),
	].join("\n\n");
}

function buildAvailableSkillCatalogSection(
	availableSkillCatalog: AvailableSkillCatalogEntry[] | undefined
): string {
	if (!availableSkillCatalog || availableSkillCatalog.length === 0) {
		return "";
	}

	const lines = availableSkillCatalog
		.map((entry) => `- \`${entry.name}\`: ${entry.summary}`)
		.join("\n");

	return [
		"## Available Skill Catalog",
		"These enabled DB skills can be loaded on demand with loadSkill(name).",
		lines,
	].join("\n\n");
}

function buildRuntimeSkillLoaderInstructions(): string {
	return `## Runtime Skill Loading

- When you need exact skill instructions, call \`loadSkill\` with the exact \`*.md\` name from the catalog.
- Use loaded skill guidance only when relevant to the current turn.
- Mentions like \`mention:tool:<id>\` are advisory context, not hard tool restrictions.`;
}
