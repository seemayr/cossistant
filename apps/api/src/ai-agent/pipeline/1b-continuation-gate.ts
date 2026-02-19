/**
 * Pipeline Step 1b: Continuation Gate
 *
 * Determines whether a queued visitor trigger should be skipped because a newer
 * AI reply already covered it, or supplemented with additional info.
 */

import type { Database } from "@api/db";
import { getLatestPublicAiMessageAfterCursor } from "@api/db/queries/conversation";
import { createModelRaw, generateText, Output } from "@api/lib/ai";
import { z } from "zod";
import type { RoleAwareMessage } from "../context/conversation";

const CONTINUATION_GATE_MODEL = "openai/gpt-4o-mini";
const CONTINUATION_GATE_TIMEOUT_MS = 3000;

const continuationGateSchema = z.object({
	decision: z.enum(["skip", "supplement"]),
	reason: z.string().min(1),
	confidence: z.enum(["high", "medium", "low"]),
	deltaHint: z.string().optional(),
});

export type ContinuationHint = {
	reason: string;
	confidence: "high" | "medium" | "low";
	deltaHint?: string;
	latestAiMessageId: string;
	latestAiMessageText: string;
};

export type ContinuationGateResult = {
	decision: "none" | "skip" | "supplement";
	reason: string;
	confidence: "high" | "medium" | "low";
	latestAiMessageId?: string;
	latestAiMessageText?: string;
	deltaHint?: string;
};

type ContinuationGateInput = {
	db: Database;
	conversationId: string;
	organizationId: string;
	triggerMessageId: string;
	triggerMessageCreatedAt: string;
	triggerMessage: RoleAwareMessage | null;
	conversationHistory: RoleAwareMessage[];
};

function normalizeText(text: string | null | undefined): string {
	return (text ?? "").replace(/\s+/g, " ").trim();
}

function isPureGreetingOrAck(text: string): boolean {
	const value = normalizeText(text).toLowerCase();
	if (!value) {
		return false;
	}

	return /^(hi|hello|hey|yo|good (morning|afternoon|evening)|ok|okay|k|thanks|thank you|thx|ty|cool|great|awesome|sounds good|alright|got it)[.!?]*$/.test(
		value
	);
}

function looksLikeFollowupQuestion(text: string): boolean {
	const normalized = normalizeText(text).toLowerCase();
	if (!normalized) {
		return false;
	}

	if (normalized.includes("?")) {
		return true;
	}

	return /\b(could you|can you|what|which|where|when|how|tell me more|share more details|what happened|what were you trying)\b/.test(
		normalized
	);
}

function fallbackContinuationDecision(params: {
	triggerText: string;
	latestAiText: string;
	latestAiMessageId: string;
	errorReason: string;
}): ContinuationGateResult {
	if (
		isPureGreetingOrAck(params.triggerText) &&
		looksLikeFollowupQuestion(params.latestAiText)
	) {
		return {
			decision: "skip",
			reason: `fallback_skip:${params.errorReason}`,
			confidence: "medium",
			latestAiMessageId: params.latestAiMessageId,
			latestAiMessageText: params.latestAiText,
		};
	}

	return {
		decision: "none",
		reason: `fallback_none:${params.errorReason}`,
		confidence: "low",
		latestAiMessageId: params.latestAiMessageId,
		latestAiMessageText: params.latestAiText,
	};
}

function buildPrompt(params: {
	triggerMessage: RoleAwareMessage;
	latestAiMessageText: string;
	conversationHistory: RoleAwareMessage[];
}): string {
	const triggerText = normalizeText(params.triggerMessage.content).slice(
		0,
		800
	);
	const latestAiText = normalizeText(params.latestAiMessageText).slice(0, 1200);

	const recentVisitorContext = params.conversationHistory
		.filter((message) => message.senderType === "visitor")
		.slice(-3)
		.map((message) => `- ${normalizeText(message.content).slice(0, 300)}`)
		.join("\n");

	return `You are deciding if a queued visitor trigger still needs a new AI reply.

Rule:
- skip: newest AI reply already covers the trigger
- supplement: trigger adds unmet intent/details and needs an additional incremental reply

Constraints:
- Prefer skip for pure greetings/acknowledgements if AI already asked a follow-up question
- Prefer skip when uncertain
- If supplement, provide a short deltaHint describing ONLY what is missing

Latest queued trigger (visitor):
${triggerText}

Newest AI reply after that trigger:
${latestAiText}

Recent visitor context:
${recentVisitorContext || "- (none)"} `;
}

export async function continuationGate(
	input: ContinuationGateInput
): Promise<ContinuationGateResult> {
	const { triggerMessage } = input;
	if (!triggerMessage) {
		return {
			decision: "none",
			reason: "no_trigger_message",
			confidence: "high",
		};
	}

	if (
		triggerMessage.senderType !== "visitor" ||
		triggerMessage.visibility !== "public"
	) {
		return {
			decision: "none",
			reason: "not_public_visitor_trigger",
			confidence: "high",
		};
	}

	const latestAiMessage = await getLatestPublicAiMessageAfterCursor(input.db, {
		conversationId: input.conversationId,
		organizationId: input.organizationId,
		afterCreatedAt: input.triggerMessageCreatedAt,
		afterId: input.triggerMessageId,
	});

	if (!latestAiMessage) {
		return {
			decision: "none",
			reason: "no_newer_public_ai_message",
			confidence: "high",
		};
	}

	const latestAiText = normalizeText(latestAiMessage.text);
	if (!latestAiText) {
		return {
			decision: "supplement",
			reason: "newer_ai_message_without_text",
			confidence: "low",
			latestAiMessageId: latestAiMessage.id,
			latestAiMessageText: latestAiText,
			deltaHint:
				"Reply with only missing details from the latest visitor message.",
		};
	}

	const abortController = new AbortController();
	const timeout = setTimeout(() => {
		abortController.abort();
	}, CONTINUATION_GATE_TIMEOUT_MS);

	try {
		const result = await generateText({
			model: createModelRaw(CONTINUATION_GATE_MODEL),
			output: Output.object({ schema: continuationGateSchema }),
			prompt: buildPrompt({
				triggerMessage,
				latestAiMessageText: latestAiText,
				conversationHistory: input.conversationHistory,
			}),
			temperature: 0,
			abortSignal: abortController.signal,
		});

		const parsed = result.output;
		if (!parsed) {
			return fallbackContinuationDecision({
				triggerText: triggerMessage.content,
				latestAiText,
				latestAiMessageId: latestAiMessage.id,
				errorReason: "empty_output",
			});
		}

		return {
			decision: parsed.decision,
			reason: parsed.reason,
			confidence: parsed.confidence,
			latestAiMessageId: latestAiMessage.id,
			latestAiMessageText: latestAiText,
			deltaHint: parsed.deltaHint,
		};
	} catch (error) {
		const reason =
			error instanceof Error && error.name === "AbortError"
				? "timeout"
				: "model_error";

		return fallbackContinuationDecision({
			triggerText: triggerMessage.content,
			latestAiText,
			latestAiMessageId: latestAiMessage.id,
			errorReason: reason,
		});
	} finally {
		clearTimeout(timeout);
	}
}
