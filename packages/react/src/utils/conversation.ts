import {
	resolveConversationTitle,
	resolveTimelineItemText,
} from "@cossistant/core";
import type { Conversation, ConversationStatus } from "@cossistant/types";

const HIDDEN_STATUSES = new Set<ConversationStatus | "closed">(["closed"]);

function hasDisplayableTitle(conversation: Conversation): boolean {
	const title = resolveConversationTitle(conversation, "visitor")?.trim();

	if (title && title.length > 0) {
		return true;
	}

	// Allow conversations with messages even if no explicit title
	const lastMessageText = resolveTimelineItemText(
		conversation.lastTimelineItem ?? { text: null, parts: [] },
		"visitor"
	)?.trim();
	return Boolean(lastMessageText && lastMessageText.length > 0);
}

export function shouldDisplayConversation(conversation: Conversation): boolean {
	if (!hasDisplayableTitle(conversation)) {
		return false;
	}

	if (conversation.deletedAt) {
		return false;
	}

	if (HIDDEN_STATUSES.has(conversation.status)) {
		return false;
	}

	return true;
}
