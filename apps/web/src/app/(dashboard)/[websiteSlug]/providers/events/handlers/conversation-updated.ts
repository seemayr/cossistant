import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import {
	type ConversationHeader,
	forEachConversationHeadersQuery,
	updateConversationHeaderInCache,
} from "@/data/conversation-header-cache";
import type { DashboardRealtimeContext } from "../types";

type ConversationUpdatedEvent = RealtimeEvent<"conversationUpdated">;

/**
 * Handle conversationUpdated events from the AI agent.
 * Updates conversation headers with new title or escalation status.
 */
export function handleConversationUpdated({
	event,
	context,
}: {
	event: ConversationUpdatedEvent;
	context: DashboardRealtimeContext;
}) {
	const { queryClient, website } = context;
	const { payload } = event;

	if (payload.websiteId !== website.id) {
		return;
	}

	const { conversationId, updates } = payload;

	// Type assertion needed because TimelineItemParts contains complex union types
	// that don't fit @normy/react-query's simpler Data type constraints
	const existingHeader = context.queryNormalizer.getObjectById(
		conversationId
	) as ConversationHeader | undefined;

	if (!existingHeader) {
		// Conversation not in cache, invalidate to refetch
		forEachConversationHeadersQuery(queryClient, website.slug, (queryKey) => {
			queryClient
				.invalidateQueries({
					queryKey,
					exact: true,
				})
				.catch((error) => {
					console.error(
						"Failed to invalidate conversation header queries:",
						error
					);
				});
		});
		return;
	}

	const headerUpdater = createHeaderUpdaterFromUpdates(updates);

	forEachConversationHeadersQuery(queryClient, website.slug, (queryKey) => {
		updateConversationHeaderInCache(
			queryClient,
			queryKey,
			conversationId,
			headerUpdater
		);
	});

	context.queryNormalizer.setNormalizedData(
		headerUpdater(existingHeader) as Parameters<
			typeof context.queryNormalizer.setNormalizedData
		>[0]
	);
}

function createHeaderUpdaterFromUpdates(
	updates: ConversationUpdatedEvent["payload"]["updates"]
): (header: ConversationHeader) => ConversationHeader {
	return (header: ConversationHeader): ConversationHeader => {
		const updatedHeader = { ...header };

		if (updates.title !== undefined) {
			updatedHeader.title = updates.title;
		}

		if (updates.escalatedAt !== undefined) {
			updatedHeader.escalatedAt = updates.escalatedAt;
		}

		if (updates.escalationReason !== undefined) {
			updatedHeader.escalationReason = updates.escalationReason;
		}

		return updatedHeader;
	};
}
