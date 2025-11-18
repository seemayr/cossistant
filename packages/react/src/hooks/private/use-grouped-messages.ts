import { SenderType } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { ConversationSeen } from "@cossistant/types/schemas";
import { useMemo } from "react";

export type GroupedMessage = {
	type: "message_group";
	senderId: string;
	senderType: SenderType;
	items: TimelineItem[];
	firstMessageId: string;
	lastMessageId: string;
	firstMessageTime: Date;
	lastMessageTime: Date;
};

export type TimelineEventItem = {
	type: "timeline_event";
	item: TimelineItem;
	timestamp: Date;
};

export type TimelineToolItem = {
	type: "timeline_tool";
	item: TimelineItem;
	tool: string | null;
	timestamp: Date;
};

export type ConversationItem =
	| GroupedMessage
	| TimelineEventItem
	| TimelineToolItem;

export type UseGroupedMessagesOptions = {
	items: TimelineItem[];
	seenData?: ConversationSeen[];
	currentViewerId?: string; // The ID of the current viewer (visitor, user, or AI agent)
	viewerType?: SenderType; // Type of the current viewer
};

export type UseGroupedMessagesProps = UseGroupedMessagesOptions;

type SeenByFilterOptions = {
	messageId: string;
	items: TimelineItem[];
	seenBy: Set<string> | undefined;
	currentViewerId?: string;
	viewerType?: SenderType;
};

// Helper function to safely get timestamp from Date or string
const getTimestamp = (date: Date | string | null | undefined): number => {
	if (!date) {
		return 0;
	}
	if (typeof date === "string") {
		return new Date(date).getTime();
	}
	return date.getTime();
};

// Helper function to safely convert to Date
const toDate = (date: Date | string | null | undefined): Date => {
	if (!date) {
		return typeof window !== "undefined" ? new Date() : new Date(0);
	}
	if (typeof date === "string") {
		return new Date(date);
	}
	return date;
};

// Helper to determine sender ID and type from a timeline item
const getSenderIdAndTypeFromTimelineItem = (
	item: TimelineItem
): { senderId: string; senderType: SenderType } => {
	if (item.visitorId) {
		return { senderId: item.visitorId, senderType: SenderType.VISITOR };
	}
	if (item.aiAgentId) {
		return { senderId: item.aiAgentId, senderType: SenderType.AI };
	}
	if (item.userId) {
		return { senderId: item.userId, senderType: SenderType.TEAM_MEMBER };
	}

	// Fallback
	return {
		senderId: item.id || "default-sender",
		senderType: SenderType.TEAM_MEMBER,
	};
};

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);

// Helper function to group timeline items (messages only, events stay separate)
const groupTimelineItems = (items: TimelineItem[]): ConversationItem[] => {
	const result: ConversationItem[] = [];
	let currentGroup: GroupedMessage | null = null;

	for (const item of items) {
		// Events don't get grouped
		if (item.type === "event") {
			// Finalize any existing group
			if (currentGroup) {
				result.push(currentGroup);
				currentGroup = null;
			}

			// Add event as standalone item
			result.push({
				type: "timeline_event",
				item,
				timestamp: toDate(item.createdAt),
			});
			continue;
		}

		if (item.type === "identification") {
			// Finalize any existing group
			if (currentGroup) {
				result.push(currentGroup);
				currentGroup = null;
			}

			// Add tool item as standalone entry
			result.push({
				type: "timeline_tool",
				item,
				tool: item.tool ?? null,
				timestamp: toDate(item.createdAt),
			});
			continue;
		}

		// Group messages by sender
		const { senderId, senderType } = getSenderIdAndTypeFromTimelineItem(item);

		if (currentGroup && currentGroup.senderId === senderId) {
			// Add to existing group
			currentGroup.items.push(item);
			currentGroup.lastMessageId = item.id || currentGroup.lastMessageId;
			currentGroup.lastMessageTime = toDate(item.createdAt);
		} else {
			// Finalize previous group if exists
			if (currentGroup) {
				result.push(currentGroup);
			}

			// Start new group
			currentGroup = {
				type: "message_group",
				senderId,
				senderType,
				items: [item],
				firstMessageId: item.id || "",
				lastMessageId: item.id || "",
				firstMessageTime: toDate(item.createdAt),
				lastMessageTime: toDate(item.createdAt),
			};
		}
	}

	if (currentGroup) {
		result.push(currentGroup);
	}

	return result;
};

// Build read receipt data for timeline items
const buildTimelineReadReceiptData = (
	seenData: ConversationSeen[],
	items: TimelineItem[]
) => {
	const seenByMap = new Map<string, Set<string>>();
	const lastReadMessageMap = new Map<string, string>();
	const unreadCountMap = new Map<string, number>();

	// Initialize map for all message-type timeline items
	for (const item of items) {
		if (item.type === "message" && item.id) {
			seenByMap.set(item.id, new Set());
		}
	}

	// Sort items by time to process in order
	const sortedItems = [...items]
		.filter((item) => item.type === "message")
		.sort((a, b) => getTimestamp(a.createdAt) - getTimestamp(b.createdAt));

	// Process seen data for each viewer
	for (const seen of seenData) {
		const seenTime = getTimestamp(seen.lastSeenAt);
		const viewerId = seen.userId || seen.visitorId || seen.aiAgentId;
		if (!viewerId) {
			continue;
		}

		let lastReadItem: TimelineItem | null = null;
		let unreadCount = 0;

		// Process items in chronological order
		for (const item of sortedItems) {
			const itemTime = getTimestamp(item.createdAt);

			if (itemTime <= seenTime) {
				// This item has been seen
				if (item.id) {
					const seenBy = seenByMap.get(item.id);
					if (seenBy) {
						seenBy.add(viewerId);
					}
				}
				lastReadItem = item;
			} else {
				// This item is unread
				unreadCount++;
			}
		}

		// Store the last read item for this viewer
		if (lastReadItem?.id) {
			lastReadMessageMap.set(viewerId, lastReadItem.id);
		}

		// Store unread count
		unreadCountMap.set(viewerId, unreadCount);
	}

	return { seenByMap, lastReadMessageMap, unreadCountMap };
};

export const filterSeenByIds = ({
	messageId,
	items,
	seenBy,
	currentViewerId,
	viewerType,
}: SeenByFilterOptions): readonly string[] => {
	if (!seenBy || seenBy.size === 0) {
		return EMPTY_STRING_ARRAY;
	}

	let filteredSeenBy = seenBy;

	if (viewerType === SenderType.VISITOR && currentViewerId) {
		const message = items.find((item) => item.id === messageId);
		if (message?.visitorId === currentViewerId) {
			filteredSeenBy = new Set(filteredSeenBy);
			filteredSeenBy.delete(currentViewerId);
		}
	}

	if (filteredSeenBy.size === 0) {
		return EMPTY_STRING_ARRAY;
	}

	return Object.freeze(Array.from(filteredSeenBy)) as readonly string[];
};

/**
 * Batches sequential timeline items from the same sender into groups and enriches
 * them with read-receipt helpers so UIs can render conversation timelines with
 * minimal effort. Seen data is normalised into quick lookup maps for unread
 * indicators.
 */
export const useGroupedMessages = ({
	items,
	seenData = [],
	currentViewerId,
	viewerType,
}: UseGroupedMessagesOptions) => {
	return useMemo(() => {
		const groupedItems = groupTimelineItems(items);

		// Build read receipt data
		const { seenByMap, lastReadMessageMap, unreadCountMap } =
			buildTimelineReadReceiptData(seenData, items);

		// Cache for turning seen sets into stable arrays across renders
		const seenByArrayCache = new Map<string, readonly string[]>();

		return {
			items: groupedItems,
			seenByMap,
			lastReadMessageMap,
			unreadCountMap,

			isMessageSeenByViewer: (messageId: string): boolean => {
				if (!currentViewerId) {
					return false;
				}
				const seenBy = seenByMap.get(messageId);
				return seenBy ? seenBy.has(currentViewerId) : false;
			},

			getMessageSeenBy: (messageId: string): readonly string[] => {
				if (seenByArrayCache.has(messageId)) {
					return seenByArrayCache.get(messageId) ?? EMPTY_STRING_ARRAY;
				}

				const seenBy = filterSeenByIds({
					items,
					seenBy: seenByMap.get(messageId),
					messageId,
					currentViewerId,
					viewerType,
				});
				if (seenBy.length === 0) {
					seenByArrayCache.set(messageId, EMPTY_STRING_ARRAY);
					return EMPTY_STRING_ARRAY;
				}

				const result = Object.freeze(Array.from(seenBy)) as readonly string[];
				seenByArrayCache.set(messageId, result);
				return result;
			},

			getLastReadMessageId: (userId: string): string | undefined =>
				lastReadMessageMap.get(userId),

			isLastReadMessage: (messageId: string, userId: string): boolean =>
				lastReadMessageMap.get(userId) === messageId,

			getUnreadCount: (userId: string): number =>
				unreadCountMap.get(userId) || 0,

			hasUnreadAfter: (messageId: string, userId: string): boolean => {
				const lastRead = lastReadMessageMap.get(userId);
				if (!lastRead) {
					return true;
				}

				const messageIndex = items.findIndex((item) => item.id === messageId);
				const lastReadIndex = items.findIndex((item) => item.id === lastRead);

				return messageIndex < lastReadIndex;
			},
		};
	}, [items, seenData, currentViewerId, viewerType]);
};
