import type { RoleAwareMessage } from "../../../contracts";
import type { DecisionSignals, SmartDecisionInput } from "./types";

const HUMAN_ACTIVE_WINDOW_MS = 120_000;

function normalizeText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
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

	const sentenceCount = value
		.split(/[.!?]+/)
		.filter((part) => part.trim().length > 0).length;

	return Math.max(1, sentenceCount) <= 1 && !looksLikeQuestionOrRequest(value);
}

function looksLikeHumanCommand(text: string): boolean {
	const value = normalizeText(text).toLowerCase();
	if (!value) {
		return false;
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

function findLastPublicHumanMessageIndex(history: RoleAwareMessage[]): number {
	for (let index = history.length - 1; index >= 0; index--) {
		const message = history[index];
		if (!message) {
			continue;
		}
		if (
			message.senderType === "human_agent" &&
			message.visibility === "public"
		) {
			return index;
		}
	}
	return -1;
}

export function extractDecisionSignals(
	input: SmartDecisionInput
): DecisionSignals {
	const { conversationHistory, triggerMessage } = input;

	const lastHumanIndex = findLastPublicHumanMessageIndex(conversationHistory);
	const messagesSinceHuman =
		lastHumanIndex >= 0 ? conversationHistory.length - 1 - lastHumanIndex : -1;

	let lastHumanPublicAtMs: number | null = null;
	if (lastHumanIndex >= 0) {
		const rawTimestamp = conversationHistory[lastHumanIndex]?.timestamp;
		const parsedTimestamp = rawTimestamp
			? Date.parse(rawTimestamp)
			: Number.NaN;
		if (!Number.isNaN(parsedTimestamp)) {
			lastHumanPublicAtMs = parsedTimestamp;
		}
	}

	const triggerTimestamp = triggerMessage.timestamp
		? Date.parse(triggerMessage.timestamp)
		: Number.NaN;
	const referenceTime = Number.isNaN(triggerTimestamp)
		? Date.now()
		: triggerTimestamp;
	const humanActive =
		lastHumanPublicAtMs !== null
			? referenceTime - lastHumanPublicAtMs <= HUMAN_ACTIVE_WINDOW_MS
			: messagesSinceHuman >= 0 && messagesSinceHuman <= 1;

	const lastHumanSecondsAgo =
		lastHumanPublicAtMs !== null
			? Math.max(0, Math.round((referenceTime - lastHumanPublicAtMs) / 1000))
			: null;

	let visitorBurstCount = 0;
	for (let index = conversationHistory.length - 1; index >= 0; index--) {
		const message = conversationHistory[index];
		if (!message) {
			continue;
		}
		if (message.senderType !== "visitor") {
			break;
		}
		visitorBurstCount++;
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
