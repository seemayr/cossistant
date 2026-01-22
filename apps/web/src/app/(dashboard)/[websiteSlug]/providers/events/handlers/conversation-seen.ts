import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import type { ConversationHeader } from "@/data/conversation-header-cache";
import { updateConversationSeenInCache } from "@/hooks/use-conversation-seen";
import type { DashboardRealtimeContext } from "../types";

type ConversationSeenEvent = RealtimeEvent<"conversationSeen">;

// Debouncing mechanism to prevent animation conflicts
// Store pending updates by conversationId
const pendingSeenUpdates = new Map<
	string,
	{
		event: ConversationSeenEvent;
		context: DashboardRealtimeContext;
		timeoutId: NodeJS.Timeout;
	}
>();

const SEEN_UPDATE_DELAY = 2000; // 2s delay to let message animations settle

type UpdateResult = {
	header: ConversationHeader;
	changed: boolean;
};

/**
 * Updates the current user's lastSeenAt in the conversation header.
 * This is the user-specific "last seen" timestamp for unread indicators.
 */
function maybeUpdateCurrentUserLastSeen(
	header: ConversationHeader,
	event: ConversationSeenEvent,
	currentUserId: string | null | undefined,
	lastSeenAtTime: number
): UpdateResult {
	if (!(event.payload.userId && currentUserId)) {
		return { header, changed: false };
	}

	if (event.payload.userId !== currentUserId) {
		return { header, changed: false };
	}

	const currentLastSeen = header.lastSeenAt
		? new Date(header.lastSeenAt).getTime()
		: null;

	if (currentLastSeen !== null && currentLastSeen >= lastSeenAtTime) {
		return { header, changed: false };
	}

	const nextDate = new Date(lastSeenAtTime).toISOString();

	return {
		header: {
			...header,
			lastSeenAt: nextDate,
		},
		changed: true,
	};
}

type SeenEntry = ConversationHeader["seenData"][number];

function buildActorPredicates(event: ConversationSeenEvent) {
	const predicates: ((seen: SeenEntry) => boolean)[] = [];

	if (event.payload.userId) {
		predicates.push((seen) => seen.userId === event.payload.userId);
	}

	if (event.payload.visitorId) {
		predicates.push((seen) => seen.visitorId === event.payload.visitorId);
	}

	if (event.payload.aiAgentId) {
		predicates.push((seen) => seen.aiAgentId === event.payload.aiAgentId);
	}

	return predicates;
}

/**
 * Updates the seenData array in the conversation header.
 * This tracks who has seen which messages in the conversation.
 */
function maybeUpdateSeenEntries(
	header: ConversationHeader,
	event: ConversationSeenEvent,
	lastSeenAtTime: number
): UpdateResult {
	const predicates = buildActorPredicates(event);

	if (predicates.length === 0) {
		return { header, changed: false };
	}

	const nextDate = new Date(lastSeenAtTime).toISOString();

	// Check if an entry exists for this actor
	const existingEntryIndex = header.seenData.findIndex((seen) =>
		predicates.some((predicate) => predicate(seen))
	);

	// If no entry exists, create a new one
	if (existingEntryIndex === -1) {
		const actorType = event.payload.userId
			? "user"
			: event.payload.visitorId
				? "visitor"
				: "ai_agent";
		const actorId =
			event.payload.userId ??
			event.payload.visitorId ??
			event.payload.aiAgentId;
		if (!actorId) {
			return { header, changed: false };
		}
		const newEntry: ConversationHeader["seenData"][number] = {
			id: `${header.id}:${actorType}:${actorId}`,
			conversationId: header.id,
			userId: event.payload.userId || null,
			visitorId: event.payload.visitorId || null,
			aiAgentId: event.payload.aiAgentId || null,
			lastSeenAt: nextDate,
			createdAt: nextDate,
			updatedAt: nextDate,
			deletedAt: null,
		};
		return {
			header: {
				...header,
				seenData: [...header.seenData, newEntry],
			},
			changed: true,
		};
	}

	const existingEntry = header.seenData[existingEntryIndex];
	const existingTimestamp = existingEntry
		? new Date(existingEntry.lastSeenAt).getTime()
		: null;

	if (
		existingTimestamp !== null &&
		!Number.isNaN(existingTimestamp) &&
		existingTimestamp >= lastSeenAtTime
	) {
		return { header, changed: false };
	}

	const nextSeenData = header.seenData.map((seen, index) => {
		if (index !== existingEntryIndex) {
			return seen;
		}

		return {
			...seen,
			lastSeenAt: nextDate,
			updatedAt: nextDate,
		};
	});

	return {
		header: {
			...header,
			seenData: nextSeenData,
		},
		changed: true,
	};
}

function applySeenUpdate(
	event: ConversationSeenEvent,
	context: DashboardRealtimeContext
) {
	const lastSeenAt = new Date(event.payload.lastSeenAt);
	const lastSeenAtTime = lastSeenAt.getTime();

	// Type assertion needed because TimelineItemParts contains complex union types
	// that don't fit @normy/react-query's simpler Data type constraints
	const existingHeader = context.queryNormalizer.getObjectById(
		event.payload.conversationId
	) as ConversationHeader | undefined;

	if (!existingHeader) {
		return;
	}

	// Update current user's lastSeenAt (for unread indicators)
	const userUpdate = maybeUpdateCurrentUserLastSeen(
		existingHeader,
		event,
		context.userId,
		lastSeenAtTime
	);

	// Update seenData entries (for read receipts)
	const seenEntriesUpdate = maybeUpdateSeenEntries(
		userUpdate.header,
		event,
		lastSeenAtTime
	);

	if (userUpdate.changed || seenEntriesUpdate.changed) {
		context.queryNormalizer.setNormalizedData(
			seenEntriesUpdate.header as Parameters<
				typeof context.queryNormalizer.setNormalizedData
			>[0]
		);
	}
}

export function handleConversationSeen({
	event,
	context,
}: {
	event: ConversationSeenEvent;
	context: DashboardRealtimeContext;
}) {
	if (event.payload.websiteId !== context.website.id) {
		return;
	}

	const conversationId = event.payload.conversationId;

	// Skip if this is the current user's own seen event - already handled optimistically
	// by useConversationActions.markRead mutation
	const isOwnUserEvent =
		event.payload.userId && event.payload.userId === context.userId;

	// Update React Query cache for reactive updates (only for other users/visitors)
	// This ensures the conversation-seen hook gets fresh data for read receipts
	if (!isOwnUserEvent) {
		updateConversationSeenInCache(context.queryClient, conversationId, {
			userId: event.payload.userId || null,
			visitorId: event.payload.visitorId || null,
			aiAgentId: event.payload.aiAgentId || null,
			lastSeenAt: event.payload.lastSeenAt,
		});
	}

	// Clear any existing pending update for this conversation
	const existing = pendingSeenUpdates.get(conversationId);
	if (existing) {
		clearTimeout(existing.timeoutId);
	}

	// Schedule the conversation header cache update after a delay to prevent animation conflicts
	const timeoutId = setTimeout(() => {
		applySeenUpdate(event, context);
		pendingSeenUpdates.delete(conversationId);
	}, SEEN_UPDATE_DELAY);

	// Store the pending update
	pendingSeenUpdates.set(conversationId, {
		event,
		context,
		timeoutId,
	});
}
