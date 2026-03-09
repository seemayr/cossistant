import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import { useMemo } from "react";

import {
	mapTypingEntriesToParticipants,
	type TimelineTypingParticipant,
} from "./private/typing";
import { useGroupedMessages } from "./private/use-grouped-messages";
import { useConversationProcessing } from "./use-conversation-processing";
import { useDebouncedConversationSeen } from "./use-conversation-seen";
import { useConversationTyping } from "./use-conversation-typing";

export type ConversationTimelineTypingParticipant = TimelineTypingParticipant;

export type UseConversationTimelineOptions = {
	conversationId: string;
	items: TimelineItem[];
	currentVisitorId?: string;
};

export type UseConversationTimelineReturn = {
	groupedMessages: ReturnType<typeof useGroupedMessages>;
	seenData: ReturnType<typeof useDebouncedConversationSeen>;
	processing: ReturnType<typeof useConversationProcessing>;
	typingEntries: ReturnType<typeof useConversationTyping>;
	typingParticipants: ConversationTimelineTypingParticipant[];
	lastVisitorMessageGroupIndex: number;
};

/**
 * Produces grouped timeline items, seen data and typing state suitable for the
 * conversation detail view.
 */
export function useConversationTimeline({
	conversationId,
	items: timelineItems,
	currentVisitorId,
}: UseConversationTimelineOptions): UseConversationTimelineReturn {
	const seenData = useDebouncedConversationSeen(conversationId);
	const processing = useConversationProcessing(conversationId);
	const typingEntries = useConversationTyping(conversationId, {
		excludeVisitorId: currentVisitorId ?? null,
	});

	const groupedMessages = useGroupedMessages({
		items: timelineItems,
		seenData,
		currentViewerId: currentVisitorId,
	});

	const lastVisitorMessageGroupIndex = useMemo(() => {
		for (let index = groupedMessages.items.length - 1; index >= 0; index--) {
			const item = groupedMessages.items[index];

			if (!item || item.type !== "message_group") {
				continue;
			}

			const firstMessage = item.items?.[0];
			if (firstMessage?.visitorId === currentVisitorId) {
				return index;
			}
		}

		return -1;
	}, [groupedMessages.items, currentVisitorId]);

	const typingParticipants = useMemo(
		() => mapTypingEntriesToParticipants(typingEntries),
		[typingEntries]
	);

	return {
		groupedMessages,
		seenData,
		processing,
		typingEntries,
		typingParticipants,
		lastVisitorMessageGroupIndex,
	};
}
