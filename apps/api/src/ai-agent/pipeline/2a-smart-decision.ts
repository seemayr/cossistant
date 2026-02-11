/**
 * Pipeline Step 2a: Smart Decision
 *
 * Uses AI to decide whether the AI agent should act on a trigger
 * (respond, observe, or assist privately).
 *
 * This is used for non-obvious cases after deterministic shortcuts.
 *
 * Design principles:
 * - Token-efficient: minimal prompt, fast model
 * - Human-like: AI observes when humans are actively chatting
 * - Balanced: responds when helpful, stays silent when not needed
 * - Smart context: selects relevant messages, not just last N
 */

import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { createModelRaw, generateText, Output } from "@api/lib/ai";
import { z } from "zod";
import type { RoleAwareMessage } from "../context/conversation";
import type { ConversationState } from "../context/state";

const HUMAN_ACTIVE_WINDOW_MS = 120_000;
const MESSAGE_CHAR_LIMIT = 220;
const MAX_MESSAGES = 10;

/**
 * What the AI decides to do
 */
export type DecisionIntent = "respond" | "observe" | "assist_team";

/**
 * Confidence in the decision
 */
export type DecisionConfidence = "high" | "medium" | "low";

export type DecisionSource = "rule" | "model" | "fallback";

/**
 * Result from the smart decision AI
 */
export type SmartDecisionResult = {
	intent: DecisionIntent;
	reasoning: string;
	confidence: DecisionConfidence;
	source?: DecisionSource;
	ruleId?: string;
};

type SmartDecisionInput = {
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	conversationHistory: RoleAwareMessage[];
	conversationState: ConversationState;
	triggerMessage: RoleAwareMessage;
};

type DecisionSignals = {
	humanActive: boolean;
	lastHumanSecondsAgo: number | null;
	messagesSinceHuman: number;
	visitorBurstCount: number;
	recentTurnPattern: string;
	triggerIsShortAckOrGreeting: boolean;
	triggerIsQuestionOrRequest: boolean;
	triggerIsSingleNonQuestion: boolean;
	triggerLooksLikeHumanCommand: boolean;
};

/**
 * Schema for the structured decision output
 */
const decisionSchema = z.object({
	intent: z
		.enum(["respond", "observe", "assist_team"])
		.describe(
			"respond = reply to visitor, observe = stay silent, assist_team = internal note only"
		),
	reasoning: z.string().describe("Brief explanation (1 sentence)"),
	confidence: z
		.enum(["high", "medium", "low"])
		.describe("How confident are you in this decision?"),
});

function normalizeText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function clipText(text: string, maxChars: number): string {
	const normalized = normalizeText(text);
	if (normalized.length <= maxChars) {
		return normalized;
	}
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function isShortAckOrGreeting(text: string): boolean {
	const value = normalizeText(text).toLowerCase();
	if (!value) {
		return false;
	}

	return /^(hi|hello|hey|yo|ok|okay|k|thanks|thank you|thx|ty|cool|great|awesome|sounds good|alright|got it|sure|yep|yup)[.!?]*$/.test(
		value
	);
}

function looksLikeQuestionOrRequest(text: string): boolean {
	const value = normalizeText(text).toLowerCase();
	if (!value) {
		return false;
	}

	if (value.includes("?")) {
		return true;
	}

	return /\b(can you|could you|would you|please|help|need|issue|problem|error|stuck|unable|cannot|can't|not working|how|what|why|when|where|which|who|tell me|explain|show me)\b/.test(
		value
	);
}

function isSingleNonQuestionMessage(text: string): boolean {
	const value = normalizeText(text);
	if (!value) {
		return false;
	}

	const sentences = value
		.split(/[.!?]+/)
		.filter((chunk) => chunk.trim().length > 0);
	const sentenceCount = Math.max(1, sentences.length);
	return sentenceCount <= 1 && !looksLikeQuestionOrRequest(value);
}

function looksLikeHumanCommand(text: string): boolean {
	const value = normalizeText(text).toLowerCase();
	if (!value) {
		return false;
	}

	if (value.includes("?")) {
		return true;
	}

	return /\b(can you|could you|please|summari[sz]e|draft|reply|respond|tell (the )?visitor|update (the )?visitor|message (the )?visitor|analy[sz]e|what do you think|help me)\b/.test(
		value
	);
}

function mapSenderToTurnCode(
	senderType: RoleAwareMessage["senderType"]
): string {
	switch (senderType) {
		case "human_agent":
			return "H";
		case "visitor":
			return "V";
		case "ai_agent":
			return "A";
		default:
			return "?";
	}
}

function findLastPublicHumanMessageIndex(
	conversationHistory: RoleAwareMessage[]
): number {
	for (let i = conversationHistory.length - 1; i >= 0; i--) {
		const message = conversationHistory[i];
		if (!message) {
			continue;
		}

		if (
			message.senderType === "human_agent" &&
			message.visibility === "public"
		) {
			return i;
		}
	}

	return -1;
}

function extractDecisionSignals(input: SmartDecisionInput): DecisionSignals {
	const { conversationHistory, triggerMessage } = input;

	const lastHumanIndex = findLastPublicHumanMessageIndex(conversationHistory);

	const messagesSinceHuman =
		lastHumanIndex >= 0 ? conversationHistory.length - 1 - lastHumanIndex : -1;

	let lastHumanPublicAt: number | null = null;
	if (lastHumanIndex >= 0) {
		const timestamp = conversationHistory[lastHumanIndex]?.timestamp;
		const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
		if (!Number.isNaN(parsed)) {
			lastHumanPublicAt = parsed;
		}
	}

	const now = Date.now();
	const humanActive =
		lastHumanPublicAt !== null
			? now - lastHumanPublicAt <= HUMAN_ACTIVE_WINDOW_MS
			: messagesSinceHuman >= 0 && messagesSinceHuman <= 1;

	const lastHumanSecondsAgo =
		lastHumanPublicAt !== null
			? Math.max(0, Math.round((now - lastHumanPublicAt) / 1000))
			: null;

	let visitorBurstCount = 0;
	for (let i = conversationHistory.length - 1; i >= 0; i--) {
		const message = conversationHistory[i];
		if (!message) {
			continue;
		}

		if (message.senderType === "visitor") {
			visitorBurstCount++;
			continue;
		}
		break;
	}

	const triggerText = normalizeText(triggerMessage.content);

	return {
		humanActive,
		lastHumanSecondsAgo,
		messagesSinceHuman,
		visitorBurstCount,
		recentTurnPattern: conversationHistory
			.slice(-6)
			.map((message) => mapSenderToTurnCode(message.senderType))
			.join(","),
		triggerIsShortAckOrGreeting:
			triggerMessage.senderType === "visitor" &&
			isShortAckOrGreeting(triggerText),
		triggerIsQuestionOrRequest: looksLikeQuestionOrRequest(triggerText),
		triggerIsSingleNonQuestion:
			triggerMessage.senderType === "visitor" &&
			isSingleNonQuestionMessage(triggerText),
		triggerLooksLikeHumanCommand:
			triggerMessage.senderType === "human_agent" &&
			looksLikeHumanCommand(triggerText),
	};
}

/**
 * Select relevant messages for context (token-light)
 *
 * Strategy:
 * 1. Include recent consecutive messages from current speaker burst
 * 2. Include the last exchange between different parties
 * 3. Include up to 3 recent human agent messages
 * 4. Cap at ~8 messages to stay token-efficient
 */
function selectRelevantMessages(
	history: RoleAwareMessage[],
	triggerMessage: RoleAwareMessage
): RoleAwareMessage[] {
	if (history.length === 0) {
		return [];
	}

	const MAX_HUMAN_MESSAGES = 3;
	const result: RoleAwareMessage[] = [];
	const seen = new Set<string>();
	const messageIndex = new Map<string, number>();
	for (let i = 0; i < history.length; i++) {
		const message = history[i];
		if (!message) {
			continue;
		}
		messageIndex.set(message.messageId, i);
	}

	const addMessage = (msg: RoleAwareMessage) => {
		if (!seen.has(msg.messageId)) {
			seen.add(msg.messageId);
			result.push(msg);
		}
	};

	// Current burst (same sender at end)
	const currentBurst: RoleAwareMessage[] = [];
	for (let i = history.length - 1; i >= 0; i--) {
		const msg = history[i];
		if (!msg) {
			continue;
		}

		if (msg.senderType === triggerMessage.senderType) {
			currentBurst.unshift(msg);
		} else {
			break;
		}
	}

	const exchangeStartIndex = history.length - currentBurst.length;

	// Previous exchange context (up to 4 sender switches)
	const contextMessages: RoleAwareMessage[] = [];
	let lastSenderType: string | null = null;
	let exchangeCount = 0;
	for (let i = exchangeStartIndex - 1; i >= 0 && exchangeCount < 4; i--) {
		const msg = history[i];
		if (!msg) {
			continue;
		}

		contextMessages.unshift(msg);
		if (msg.senderType !== lastSenderType) {
			exchangeCount++;
			lastSenderType = msg.senderType;
		}
	}

	// Recent human agent messages (last N)
	const humanAgentMessages: RoleAwareMessage[] = [];
	for (let i = history.length - 1; i >= 0; i--) {
		const msg = history[i];
		if (!msg) {
			continue;
		}

		if (msg.senderType === "human_agent") {
			humanAgentMessages.unshift(msg);
			if (humanAgentMessages.length >= MAX_HUMAN_MESSAGES) {
				break;
			}
		}
	}

	for (const msg of humanAgentMessages) {
		addMessage(msg);
	}
	for (const msg of contextMessages) {
		addMessage(msg);
	}
	for (const msg of currentBurst) {
		addMessage(msg);
	}

	return result
		.sort((a, b) => {
			const aIndex = messageIndex.get(a.messageId) ?? 0;
			const bIndex = messageIndex.get(b.messageId) ?? 0;
			return aIndex - bIndex;
		})
		.slice(-MAX_MESSAGES);
}

/**
 * Format a message for the prompt
 */
function formatMessage(msg: RoleAwareMessage): string {
	const privatePrefix = msg.visibility === "private" ? "[PRIVATE] " : "";
	const prefix =
		msg.senderType === "visitor"
			? "[VISITOR]"
			: msg.senderType === "human_agent"
				? `[TEAM:${msg.senderName || "Agent"}]`
				: "[AI]";
	return `${privatePrefix}${prefix} ${clipText(msg.content, MESSAGE_CHAR_LIMIT)}`;
}

/**
 * Build the prompt for the decision AI
 */
function buildDecisionPrompt(
	input: SmartDecisionInput,
	signals: DecisionSignals
): string {
	const { conversationHistory, triggerMessage, conversationState } = input;
	const historyWithoutTrigger = conversationHistory.filter(
		(message) => message.messageId !== triggerMessage.messageId
	);

	// Select relevant messages (smart selection, not just last N)
	const relevantMessages = selectRelevantMessages(
		historyWithoutTrigger,
		triggerMessage
	);

	// Format messages
	const formattedMessages =
		relevantMessages.length > 0
			? relevantMessages.map(formatMessage).join("\n")
			: "- (none)";

	return `You are the decision gate for a support AI.

Pick one intent:
- respond: AI should take this turn now
- observe: AI should not act this turn
- assist_team: internal/private help only (no visitor-facing message)

Intent guidance:
- For visitor triggers, "respond" means reply to the visitor.
- For human-agent triggers, "respond" means execute the teammate's request (can be public or private as needed).
- "assist_team" means leave internal guidance only.

Decision policy:
- Priority 1: protect human conversation continuity; if a teammate is actively handling and AI value is unclear, choose observe.
- Priority 2: resolve clear unmet visitor need; choose respond for unanswered questions or explicit help requests.
- Priority 3: honor teammate intent; choose respond for clear execution commands and assist_team for internal analysis/handoff.
- For greetings (hi, hello, hey): prefer respond when humanActive=false — the AI should engage and start the conversation. When humanActive=true, prefer observe.
- Prefer observe for short acknowledgements (ok, thanks, got it) or banter without a clear need.
- If uncertain, choose observe.

Signals:
- triggerSender=${triggerMessage.senderType}
- triggerVisibility=${triggerMessage.visibility}
- humanActive=${signals.humanActive}
- lastHumanSecondsAgo=${signals.lastHumanSecondsAgo ?? "none"}
- messagesSinceHuman=${signals.messagesSinceHuman >= 0 ? signals.messagesSinceHuman : "none"}
- hasHumanAssignee=${conversationState.hasHumanAssignee}
- escalated=${conversationState.isEscalated}
- visitorBurst=${signals.visitorBurstCount}
- recentTurns=${signals.recentTurnPattern || "none"}

Conversation:
${formattedMessages}

Latest trigger:
${formatMessage(triggerMessage)}

Return concise reasoning (max 1 sentence).`;
}

function observeDecision(params: {
	reasoning: string;
	confidence: DecisionConfidence;
	source: DecisionSource;
	ruleId?: string;
}): SmartDecisionResult {
	return {
		intent: "observe",
		reasoning: params.reasoning,
		confidence: params.confidence,
		source: params.source,
		ruleId: params.ruleId,
	};
}

function applyDeterministicRules(
	input: SmartDecisionInput,
	signals: DecisionSignals
): SmartDecisionResult | null {
	const { triggerMessage } = input;

	if (
		triggerMessage.senderType === "human_agent" &&
		!signals.triggerLooksLikeHumanCommand
	) {
		const ruleId =
			triggerMessage.visibility === "private"
				? "human_private_non_command_observe"
				: "human_public_non_command_observe";

		return observeDecision({
			reasoning:
				"Human teammate is handling the conversation without a clear AI command.",
			confidence: "high",
			source: "rule",
			ruleId,
		});
	}

	if (triggerMessage.senderType === "visitor" && signals.humanActive) {
		if (signals.triggerIsShortAckOrGreeting) {
			return observeDecision({
				reasoning:
					"Visitor acknowledgement while human is active does not need AI.",
				confidence: "high",
				source: "rule",
				ruleId: "visitor_ack_with_human_active_observe",
			});
		}

		if (signals.triggerIsSingleNonQuestion) {
			return observeDecision({
				reasoning:
					"Single non-question visitor message while human is active should not be interrupted.",
				confidence: "medium",
				source: "rule",
				ruleId: "visitor_single_non_question_human_active_observe",
			});
		}
	}

	return null;
}

function shouldClampModelRespond(params: {
	modelDecision: SmartDecisionResult;
	signals: DecisionSignals;
}): boolean {
	const { modelDecision, signals } = params;

	if (modelDecision.intent !== "respond") {
		return false;
	}
	if (!signals.humanActive) {
		return false;
	}
	if (modelDecision.confidence === "high") {
		return false;
	}
	if (signals.triggerIsQuestionOrRequest) {
		return false;
	}

	return true;
}

function logDecision(params: {
	convId: string;
	result: SmartDecisionResult;
	signals: DecisionSignals;
}): void {
	const { convId, result, signals } = params;
	console.log(
		`[ai-agent:smart-decision] conv=${convId} | source=${result.source ?? "model"} | ruleId=${result.ruleId ?? "none"} | intent=${result.intent} confidence=${result.confidence} | humanActive=${signals.humanActive} visitorBurst=${signals.visitorBurstCount} lastHumanSecondsAgo=${signals.lastHumanSecondsAgo ?? "none"} | "${result.reasoning}"`
	);
}

/**
 * Models for decision, tried sequentially.
 * Primary: fast & cheap. Fallback: proven stable (used in continuation gate).
 */
const DECISION_MODELS = [
	{ id: "google/gemini-2.5-flash", timeoutMs: 4000 },
	{ id: "openai/gpt-4o-mini", timeoutMs: 4000 },
];

/**
 * Run smart decision to determine if AI should respond
 *
 * Uses a lightweight AI call to evaluate:
 * - Is there a human actively handling this?
 * - Is this message directed at the AI or the human?
 * - Is a response actually needed?
 */
export async function runSmartDecision(
	input: SmartDecisionInput
): Promise<SmartDecisionResult> {
	const convId = input.conversation.id;
	const signals = extractDecisionSignals(input);

	console.log(
		`[ai-agent:smart-decision] conv=${convId} | Running smart decision | humanActive=${signals.humanActive} triggerSender=${input.triggerMessage.senderType}`
	);

	const ruleDecision = applyDeterministicRules(input, signals);
	if (ruleDecision) {
		logDecision({
			convId,
			result: ruleDecision,
			signals,
		});
		return ruleDecision;
	}

	const prompt = buildDecisionPrompt(input, signals);

	// Try each model sequentially until one succeeds
	for (const [i, modelConfig] of DECISION_MODELS.entries()) {
		const isLastModel = i === DECISION_MODELS.length - 1;
		const abortController = new AbortController();
		const timeout = setTimeout(() => {
			abortController.abort();
		}, modelConfig.timeoutMs);

		try {
			const result = await generateText({
				model: createModelRaw(modelConfig.id),
				output: Output.object({
					schema: decisionSchema,
				}),
				prompt,
				temperature: 0,
				abortSignal: abortController.signal,
			});

			const decision = result.output;

			if (!decision) {
				// Empty output — try next model if available
				if (!isLastModel) {
					console.log(
						`[ai-agent:smart-decision] conv=${convId} | model=${modelConfig.id} returned empty output, trying next model`
					);
					continue;
				}

				const fallback = observeDecision({
					reasoning: "Smart decision returned no output, defaulting to observe",
					confidence: "low",
					source: "fallback",
					ruleId: "empty_output_observe",
				});
				logDecision({ convId, result: fallback, signals });
				return fallback;
			}

			const modelDecision: SmartDecisionResult = {
				intent: decision.intent,
				reasoning: decision.reasoning,
				confidence: decision.confidence,
				source: "model",
			};

			if (i > 0) {
				console.log(
					`[ai-agent:smart-decision] conv=${convId} | succeeded with fallback model=${modelConfig.id} (attempt ${i + 1})`
				);
			}

			const finalDecision = shouldClampModelRespond({
				modelDecision,
				signals,
			})
				? observeDecision({
						reasoning:
							"Conservative clamp applied: low-confidence response during active human handling.",
						confidence: "medium",
						source: "rule",
						ruleId: "post_model_human_active_low_confidence_observe",
					})
				: modelDecision;

			logDecision({ convId, result: finalDecision, signals });

			if (result.usage) {
				console.log(
					`[ai-agent:smart-decision] conv=${convId} | model=${modelConfig.id} tokens: in=${result.usage.inputTokens} out=${result.usage.outputTokens}`
				);
			}

			return finalDecision;
		} catch (error) {
			const isTimeout = error instanceof Error && error.name === "AbortError";
			const errorType = isTimeout ? "timeout" : "error";

			if (!isLastModel) {
				console.log(
					`[ai-agent:smart-decision] conv=${convId} | model=${modelConfig.id} ${errorType}, trying next model`
				);
				continue;
			}

			// All models exhausted
			const fallback = observeDecision({
				reasoning: isTimeout
					? "All decision models timed out, defaulting to observe"
					: "All decision models failed, defaulting to observe",
				confidence: "low",
				source: "fallback",
				ruleId: isTimeout ? "timeout_observe" : "error_observe",
			});
			logDecision({ convId, result: fallback, signals });
			return fallback;
		} finally {
			clearTimeout(timeout);
		}
	}

	// Should never reach here, but TypeScript needs it
	const fallback = observeDecision({
		reasoning: "No decision models configured",
		confidence: "low",
		source: "fallback",
		ruleId: "no_models_observe",
	});
	logDecision({ convId, result: fallback, signals });
	return fallback;
}

/**
 * Check if smart decision should be used for this message
 *
 * This helper returns true for any non-null, non-AI trigger.
 * Deterministic skip/respond shortcuts can run before this gate.
 */
export function shouldUseSmartDecision(input: {
	triggerMessage: RoleAwareMessage | null;
	conversationHistory: RoleAwareMessage[];
}): boolean {
	const { triggerMessage } = input;

	if (!triggerMessage) {
		return false;
	}

	return triggerMessage.senderType !== "ai_agent";
}
