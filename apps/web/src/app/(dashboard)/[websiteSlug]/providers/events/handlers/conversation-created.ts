import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import {
	forEachConversationHeadersQuery,
	prependConversationHeaderInCache,
} from "@/data/conversation-header-cache";
import type { DashboardRealtimeContext } from "../types";

type ConversationCreatedEvent = RealtimeEvent<"conversationCreated">;

export function handleConversationCreated({
	event,
	context,
}: {
	event: ConversationCreatedEvent;
	context: DashboardRealtimeContext;
}) {
	if (event.payload.websiteId !== context.website.id) {
		return;
	}

	const { header } = event.payload;

	// Type assertion needed because TimelineItemParts contains complex union types
	// that don't fit @normy/react-query's simpler Data type constraints
	context.queryNormalizer.setNormalizedData(
		header as Parameters<typeof context.queryNormalizer.setNormalizedData>[0]
	);

	forEachConversationHeadersQuery(
		context.queryClient,
		context.website.slug,
		(queryKey) => {
			prependConversationHeaderInCache(context.queryClient, queryKey, header);
		}
	);
}
