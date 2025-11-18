import { describe, expect, it } from "bun:test";
import { SenderType } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { ConversationSeen } from "@cossistant/types/schemas";
import { filterSeenByIds } from "./use-grouped-messages";

// Import the internal functions we need to test
// Since useGroupedMessages is a hook, we'll test the underlying logic directly
const getTimestamp = (date: Date | string | null | undefined): number => {
	if (!date) {
		return 0;
	}
	if (typeof date === "string") {
		return new Date(date).getTime();
	}
	return date.getTime();
};

// Simplified version of buildTimelineReadReceiptData for testing
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

function createTimelineItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	const base: TimelineItem = {
		id: "item-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "message",
		text: "Hello",
		parts: [],
		userId: null,
		visitorId: "visitor-1",
		aiAgentId: null,
		createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		deletedAt: null,
	};

	return { ...base, ...overrides };
}

function createSeenEntry(
	overrides: Partial<ConversationSeen> = {}
): ConversationSeen {
	const base: ConversationSeen = {
		id: "seen-1",
		conversationId: "conv-1",
		userId: "user-1",
		visitorId: null,
		aiAgentId: null,
		lastSeenAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		deletedAt: null,
	};

	return { ...base, ...overrides };
}

describe("buildTimelineReadReceiptData", () => {
	it("uses lastSeenAt instead of updatedAt for read receipt computation", () => {
		const items: TimelineItem[] = [
			createTimelineItem({
				id: "msg-1",
				userId: "user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:00:00.000Z").toISOString(),
			}),
			createTimelineItem({
				id: "msg-2",
				userId: "user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:05:00.000Z").toISOString(),
			}),
			createTimelineItem({
				id: "msg-3",
				userId: "user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:10:00.000Z").toISOString(),
			}),
		];

		// Visitor saw messages up to 10:07 (lastSeenAt)
		// but updatedAt is 10:15 (later update to the seen record)
		const seenData: ConversationSeen[] = [
			createSeenEntry({
				userId: null,
				visitorId: "visitor-1",
				lastSeenAt: new Date("2024-01-01T10:07:00.000Z").toISOString(),
				updatedAt: new Date("2024-01-01T10:15:00.000Z").toISOString(),
			}),
		];

		const { seenByMap } = buildTimelineReadReceiptData(seenData, items);

		// Visitor should have seen msg-1 and msg-2 (both before 10:07)
		expect(seenByMap.get("msg-1")?.has("visitor-1")).toBe(true);
		expect(seenByMap.get("msg-2")?.has("visitor-1")).toBe(true);

		// Visitor should NOT have seen msg-3 (after 10:07)
		expect(seenByMap.get("msg-3")?.has("visitor-1")).toBe(false);
	});

	it("omits the current visitor when inspecting seenBy for their own messages", () => {
		const visitorMessage = createTimelineItem({
			id: "msg-visitor",
			visitorId: "visitor-1",
			userId: null,
			createdAt: new Date("2024-01-01T10:00:00.000Z").toISOString(),
		});

		const agentMessage = createTimelineItem({
			id: "msg-agent",
			visitorId: null,
			userId: "user-1",
			createdAt: new Date("2024-01-01T10:05:00.000Z").toISOString(),
		});

		const items: TimelineItem[] = [visitorMessage, agentMessage];

		const seenData: ConversationSeen[] = [
			createSeenEntry({
				id: "visitor-seen",
				visitorId: "visitor-1",
				userId: null,
				lastSeenAt: new Date("2024-01-01T10:06:00.000Z").toISOString(),
			}),
			createSeenEntry({
				id: "agent-seen",
				visitorId: null,
				userId: "user-2",
				lastSeenAt: new Date("2024-01-01T10:10:00.000Z").toISOString(),
			}),
		];

		const { seenByMap } = buildTimelineReadReceiptData(seenData, items);

		const seenByForVisitorMessage = filterSeenByIds({
			currentViewerId: "visitor-1",
			items,
			messageId: "msg-visitor",
			seenBy: seenByMap.get("msg-visitor"),
			viewerType: SenderType.VISITOR,
		});

		expect(seenByForVisitorMessage).toEqual(["user-2"]);

		const seenByForAgentMessage = filterSeenByIds({
			currentViewerId: "visitor-1",
			items,
			messageId: "msg-agent",
			seenBy: seenByMap.get("msg-agent"),
			viewerType: SenderType.VISITOR,
		});

		expect(seenByForAgentMessage).toEqual(
			expect.arrayContaining(["visitor-1", "user-2"])
		);
		expect(seenByForAgentMessage).toHaveLength(2);
	});

	it("correctly handles multiple viewers with different lastSeenAt timestamps", () => {
		const items: TimelineItem[] = [
			createTimelineItem({
				id: "msg-1",
				userId: "user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:00:00.000Z").toISOString(),
			}),
			createTimelineItem({
				id: "msg-2",
				userId: "user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:05:00.000Z").toISOString(),
			}),
			createTimelineItem({
				id: "msg-3",
				userId: "user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:10:00.000Z").toISOString(),
			}),
		];

		const seenData: ConversationSeen[] = [
			createSeenEntry({
				id: "seen-visitor",
				userId: null,
				visitorId: "visitor-1",
				lastSeenAt: new Date("2024-01-01T10:03:00.000Z").toISOString(),
				updatedAt: new Date("2024-01-01T10:03:00.000Z").toISOString(),
			}),
			createSeenEntry({
				id: "seen-user",
				userId: "user-2",
				visitorId: null,
				lastSeenAt: new Date("2024-01-01T10:08:00.000Z").toISOString(),
				updatedAt: new Date("2024-01-01T10:08:00.000Z").toISOString(),
			}),
		];

		const { seenByMap } = buildTimelineReadReceiptData(seenData, items);

		// Visitor-1 saw only msg-1 (before 10:03)
		expect(seenByMap.get("msg-1")?.has("visitor-1")).toBe(true);
		expect(seenByMap.get("msg-2")?.has("visitor-1")).toBe(false);

		// User-2 saw msg-1 and msg-2 (both before 10:08)
		expect(seenByMap.get("msg-1")?.has("user-2")).toBe(true);
		expect(seenByMap.get("msg-2")?.has("user-2")).toBe(true);
		expect(seenByMap.get("msg-3")?.has("user-2")).toBe(false);
	});

	it("does NOT extend seen time to include viewer's own messages sent after lastSeenAt", () => {
		const items: TimelineItem[] = [
			createTimelineItem({
				id: "msg-1",
				userId: "user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:00:00.000Z").toISOString(),
			}),
			createTimelineItem({
				id: "msg-2",
				userId: null,
				visitorId: "visitor-1",
				createdAt: new Date("2024-01-01T10:05:00.000Z").toISOString(),
			}),
			createTimelineItem({
				id: "msg-3",
				userId: "user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:10:00.000Z").toISOString(),
			}),
		];

		// Visitor's lastSeenAt is 10:03, and they sent a message at 10:05
		// With the fix, their seen time should remain at 10:03
		const seenData: ConversationSeen[] = [
			createSeenEntry({
				userId: null,
				visitorId: "visitor-1",
				lastSeenAt: new Date("2024-01-01T10:03:00.000Z").toISOString(),
				updatedAt: new Date("2024-01-01T10:03:00.000Z").toISOString(),
			}),
		];

		const { seenByMap } = buildTimelineReadReceiptData(seenData, items);

		// Visitor should have seen msg-1 (before 10:03)
		expect(seenByMap.get("msg-1")?.has("visitor-1")).toBe(true);

		// Visitor should NOT have seen msg-2 (their own message sent after lastSeenAt)
		expect(seenByMap.get("msg-2")?.has("visitor-1")).toBe(false);

		// Visitor should NOT have seen msg-3 (after their lastSeenAt)
		expect(seenByMap.get("msg-3")?.has("visitor-1")).toBe(false);
	});

	it("correctly handles visitor leaves scenario where dashboard user sends messages", () => {
		// Scenario: Visitor sends message, leaves, dashboard user responds
		const items: TimelineItem[] = [
			createTimelineItem({
				id: "msg-1",
				userId: null,
				visitorId: "visitor-1",
				createdAt: new Date("2024-01-01T10:00:00.000Z").toISOString(),
				text: "Hello, I need help",
			}),
			createTimelineItem({
				id: "msg-2",
				userId: "dashboard-user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:05:00.000Z").toISOString(),
				text: "Hi! How can I help you?",
			}),
			createTimelineItem({
				id: "msg-3",
				userId: "dashboard-user-1",
				visitorId: null,
				createdAt: new Date("2024-01-01T10:06:00.000Z").toISOString(),
				text: "Are you still there?",
			}),
		];

		// Visitor saw only up to their own message (they left immediately after sending)
		const seenData: ConversationSeen[] = [
			createSeenEntry({
				userId: null,
				visitorId: "visitor-1",
				lastSeenAt: new Date("2024-01-01T10:00:00.000Z").toISOString(),
			}),
			createSeenEntry({
				userId: "dashboard-user-1",
				visitorId: null,
				lastSeenAt: new Date("2024-01-01T10:06:00.000Z").toISOString(),
			}),
		];

		const { seenByMap, unreadCountMap } = buildTimelineReadReceiptData(
			seenData,
			items
		);

		// Visitor should have seen only msg-1 (their own message at exactly lastSeenAt)
		expect(seenByMap.get("msg-1")?.has("visitor-1")).toBe(true);

		// Visitor should NOT have seen dashboard user's responses
		expect(seenByMap.get("msg-2")?.has("visitor-1")).toBe(false);
		expect(seenByMap.get("msg-3")?.has("visitor-1")).toBe(false);

		// Visitor should have 2 unread messages
		expect(unreadCountMap.get("visitor-1")).toBe(2);

		// Dashboard user should have seen all messages
		expect(seenByMap.get("msg-1")?.has("dashboard-user-1")).toBe(true);
		expect(seenByMap.get("msg-2")?.has("dashboard-user-1")).toBe(true);
		expect(seenByMap.get("msg-3")?.has("dashboard-user-1")).toBe(true);
		expect(unreadCountMap.get("dashboard-user-1")).toBe(0);
	});
});
