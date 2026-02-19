/**
 * Pipeline Step 2: Decision
 *
 * This step determines if and how the AI agent should respond.
 *
 * Design:
 * - Keep deterministic logic minimal (safety + explicit tags)
 * - Let smart decision handle untagged conversational ambiguity
 */

import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { RoleAwareMessage } from "../context/conversation";
import type { ConversationState } from "../context/state";
import {
	runSmartDecision,
	type SmartDecisionResult,
} from "./2a-smart-decision";

export type ResponseMode =
	| "respond_to_visitor"
	| "respond_to_command"
	| "background_only";

export type DecisionResult = {
	shouldAct: boolean;
	reason: string;
	mode: ResponseMode;
	humanCommand: string | null;
	/** Whether conversation is currently escalated (human requested) */
	isEscalated: boolean;
	/** Reason for escalation if escalated */
	escalationReason: string | null;
	/** Smart decision details if AI was used */
	smartDecision?: SmartDecisionResult;
};

type DecisionInput = {
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	conversationHistory: RoleAwareMessage[];
	conversationState: ConversationState;
	triggerMessage: RoleAwareMessage | null;
	decisionPolicy?: string;
};

const MENTION_REGEX = /\[@([^\]]+)\]\(mention:([^:]+):([^)]+)\)/g;
const TEXT_MENTION_REGEX = /@([a-zA-Z0-9][a-zA-Z0-9 _-]{0,60})/g;
const PLAIN_TAG_REGEX = /[.,!?]+$/;

/**
 * Determine if and how the AI agent should act
 */
export async function decide(input: DecisionInput): Promise<DecisionResult> {
	const { triggerMessage, conversationState, aiAgent } = input;
	const convId = input.conversation.id;

	// No trigger message - don't act
	if (!triggerMessage) {
		console.log(
			`[ai-agent:decision] conv=${convId} | No trigger message, skipping`
		);
		return {
			shouldAct: false,
			reason: "No trigger message",
			mode: "background_only",
			humanCommand: null,
			isEscalated: conversationState.isEscalated,
			escalationReason: conversationState.escalationReason,
		};
	}

	// Never respond to AI-authored messages (defensive guard).
	if (triggerMessage.senderType === "ai_agent") {
		console.log(
			`[ai-agent:decision] conv=${convId} | AI-authored trigger, skipping`
		);
		return {
			shouldAct: false,
			reason: "AI-authored message cannot trigger AI response",
			mode: "background_only",
			humanCommand: null,
			isEscalated: conversationState.isEscalated,
			escalationReason: conversationState.escalationReason,
		};
	}

	// AI paused - never respond
	if (isAiPaused(input.conversation)) {
		console.log(`[ai-agent:decision] conv=${convId} | AI is paused, skipping`);
		return {
			shouldAct: false,
			reason: "AI is paused for this conversation",
			mode: "background_only",
			humanCommand: null,
			isEscalated: conversationState.isEscalated,
			escalationReason: conversationState.escalationReason,
		};
	}

	const tagResult = detectAiTag(triggerMessage, aiAgent);
	const cleanedText = tagResult.cleanedText;

	// Explicit tag - always respond.
	// Human commands may still choose private/public messaging during generation.
	if (tagResult.tagged) {
		const mode =
			triggerMessage.senderType === "human_agent"
				? "respond_to_command"
				: "respond_to_visitor";
		const humanCommand =
			triggerMessage.senderType === "human_agent"
				? stripLeadingTag(cleanedText, aiAgent.name)
				: null;

		console.log(
			`[ai-agent:decision] conv=${convId} | Explicit tag detected (${tagResult.source}), responding`
		);
		return {
			shouldAct: true,
			reason: "AI was explicitly tagged",
			mode,
			humanCommand,
			isEscalated: conversationState.isEscalated,
			escalationReason: conversationState.escalationReason,
		};
	}

	// All untagged cases route through smart decision.
	console.log(
		`[ai-agent:decision] conv=${convId} | Untagged trigger (${triggerMessage.senderType}/${triggerMessage.visibility}), running smart decision`
	);

	const smartResult = await runSmartDecision({
		aiAgent: input.aiAgent,
		conversation: input.conversation,
		conversationHistory: input.conversationHistory,
		conversationState,
		triggerMessage,
		decisionPolicy: input.decisionPolicy,
	});

	return decisionFromSmartResult({
		triggerMessage,
		conversationState,
		smartResult,
		humanCommand:
			triggerMessage.senderType === "human_agent" ? cleanedText.trim() : null,
	});
}

function stripMentionMarkdown(text: string): string {
	return text.replace(MENTION_REGEX, (_raw, name) => `@${name}`);
}

function normalizeName(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function detectMarkdownMention(text: string, aiAgentId: string): boolean {
	for (const match of text.matchAll(MENTION_REGEX)) {
		const type = (match[2] ?? "").toLowerCase();
		const id = match[3] ?? "";
		if (id === aiAgentId && (type === "ai-agent" || type === "ai_agent")) {
			return true;
		}
	}
	return false;
}

function detectPlainTextTag(text: string, aiAgentName: string): boolean {
	const normalizedAgentName = normalizeName(aiAgentName);
	if (!normalizedAgentName) {
		return false;
	}
	const agentWordCount = normalizedAgentName.split(" ").length;
	const normalizedAgentNoSpace = normalizedAgentName.replace(/\s+/g, "");

	for (const match of text.matchAll(TEXT_MENTION_REGEX)) {
		const raw = (match[1] ?? "").replace(PLAIN_TAG_REGEX, "");
		const normalized = normalizeName(raw);
		if (!normalized) {
			continue;
		}

		const words = normalized.split(" ");
		const leadingCandidate = words.slice(0, agentWordCount).join(" ");
		if (leadingCandidate === normalizedAgentName) {
			return true;
		}

		if (leadingCandidate.replace(/\s+/g, "") === normalizedAgentNoSpace) {
			return true;
		}
	}

	return false;
}

function stripLeadingTag(text: string, aiAgentName: string): string {
	let cleaned = text.trim();

	// Remove @AgentName at start (best-effort, supports spaces)
	if (cleaned.startsWith("@")) {
		const normalizedAgentName = normalizeName(aiAgentName);
		if (normalizedAgentName) {
			const normalizedAgentNoSpace = normalizedAgentName.replace(/\s+/g, "");
			const words = cleaned.slice(1).split(/\s+/);
			const agentWordCount = aiAgentName.trim().split(/\s+/).length;
			const leadingCandidate = words.slice(0, agentWordCount).join(" ");
			const normalizedLeadingCandidate = normalizeName(leadingCandidate);
			if (
				normalizedLeadingCandidate === normalizedAgentName ||
				normalizedLeadingCandidate.replace(/\s+/g, "") ===
					normalizedAgentNoSpace
			) {
				cleaned = words.slice(agentWordCount).join(" ").trim();
			}
		}
	}

	return cleaned || text.trim();
}

function detectAiTag(
	message: RoleAwareMessage,
	aiAgent: AiAgentSelect
): {
	tagged: boolean;
	source: "markdown" | "text" | null;
	cleanedText: string;
} {
	const cleanedText = stripMentionMarkdown(message.content);

	if (detectMarkdownMention(message.content, aiAgent.id)) {
		return { tagged: true, source: "markdown", cleanedText };
	}

	if (detectPlainTextTag(cleanedText, aiAgent.name)) {
		return { tagged: true, source: "text", cleanedText };
	}

	return { tagged: false, source: null, cleanedText };
}

function decisionFromSmartResult(params: {
	triggerMessage: RoleAwareMessage;
	conversationState: ConversationState;
	smartResult: SmartDecisionResult;
	humanCommand: string | null;
}): DecisionResult {
	const { triggerMessage, conversationState, smartResult, humanCommand } =
		params;

	if (smartResult.intent === "observe") {
		return {
			shouldAct: false,
			reason: `Smart decision: ${smartResult.reasoning}`,
			mode: "background_only",
			humanCommand: null,
			isEscalated: conversationState.isEscalated,
			escalationReason: conversationState.escalationReason,
			smartDecision: smartResult,
		};
	}

	if (smartResult.intent === "assist_team") {
		return {
			shouldAct: true,
			reason: `Smart decision: ${smartResult.reasoning}`,
			mode: "background_only",
			humanCommand:
				triggerMessage.senderType === "human_agent" ? humanCommand : null,
			isEscalated: conversationState.isEscalated,
			escalationReason: conversationState.escalationReason,
			smartDecision: smartResult,
		};
	}

	if (triggerMessage.senderType === "human_agent") {
		return {
			shouldAct: true,
			reason: `Smart decision: ${smartResult.reasoning}`,
			mode: "respond_to_command",
			humanCommand,
			isEscalated: conversationState.isEscalated,
			escalationReason: conversationState.escalationReason,
			smartDecision: smartResult,
		};
	}

	return {
		shouldAct: true,
		reason: `Smart decision: ${smartResult.reasoning}`,
		mode: "respond_to_visitor",
		humanCommand: null,
		isEscalated: conversationState.isEscalated,
		escalationReason: conversationState.escalationReason,
		smartDecision: smartResult,
	};
}

/**
 * Check if AI is paused for this conversation
 */
function isAiPaused(conversation: ConversationSelect): boolean {
	if (!conversation.aiPausedUntil) {
		return false;
	}

	return new Date(conversation.aiPausedUntil) > new Date();
}
