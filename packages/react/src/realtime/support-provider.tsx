import type { CossistantClient } from "@cossistant/core";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import type React from "react";
import { useMemo } from "react";
import { useSupport } from "../provider";
import { applyConversationSeenEvent } from "./seen-store";
import {
	applyConversationTypingEvent,
	clearTypingFromTimelineItem,
} from "./typing-store";
import { useRealtime } from "./use-realtime";

type SupportRealtimeContext = {
	websiteId: string | null;
	visitorId: string | null;
	client: CossistantClient;
};

type SupportRealtimeProviderProps = {
	children: React.ReactNode;
};

/**
 * Bridges websocket events into the core client stores so support hooks stay
 * in sync without forcing refetches.
 */
export function SupportRealtimeProvider({
	children,
}: SupportRealtimeProviderProps): React.ReactElement {
	const { website, client, visitor } = useSupport();

	const realtimeContext = useMemo<SupportRealtimeContext>(
		() => ({
			websiteId: website?.id ?? null,
			visitorId: visitor?.id ?? null,
			client,
		}),
		[website?.id, visitor?.id, client]
	);

	const events = useMemo(
                () => ({
                        conversationCreated: (
                                _data: unknown,
                                {
                                        event,
                                        context,
                                }: {
                                        event: RealtimeEvent<"conversationCreated">;
                                        context: SupportRealtimeContext;
                                }
                        ) => {
                                if (
                                        context.websiteId &&
                                        event.payload.websiteId !== context.websiteId
                                ) {
                                        return;
                                }

                                context.client.handleRealtimeEvent(event);
                        },
                        timelineItemCreated: (
                                _data: unknown,
                                {
					event,
					context,
				}: {
					event: RealtimeEvent<"timelineItemCreated">;
					context: SupportRealtimeContext;
				}
			) => {
				if (
					context.websiteId &&
					event.payload.websiteId !== context.websiteId
				) {
					return;
				}

				// Clear typing state when a timeline item is created
				clearTypingFromTimelineItem(event);

				context.client.handleRealtimeEvent(event);
			},
			conversationSeen: (
				_data: unknown,
				{
					event,
					context,
				}: {
					event: RealtimeEvent<"conversationSeen">;
					context: SupportRealtimeContext;
				}
			) => {
				if (
					context.websiteId &&
					event.payload.websiteId !== context.websiteId
				) {
					return;
				}

				// Update the seen store so the UI reflects who has seen messages
				applyConversationSeenEvent(event);
			},
			conversationTyping: (
				_data: unknown,
				{
					event,
					context,
				}: {
					event: RealtimeEvent<"conversationTyping">;
					context: SupportRealtimeContext;
				}
			) => {
				if (
					context.websiteId &&
					event.payload.websiteId !== context.websiteId
				) {
					return;
				}

				// Update typing store, but ignore events from the current visitor (their own typing)
				// Note: We use context.visitorId which is fresh from the context object
				applyConversationTypingEvent(event, {
					ignoreVisitorId: context.visitorId,
				});
			},
			conversationEventCreated: (
				_data: unknown,
				{
					event,
					context,
				}: {
					event: RealtimeEvent<"conversationEventCreated">;
					context: SupportRealtimeContext;
				}
			) => {
				if (
					context.websiteId &&
					event.payload.websiteId !== context.websiteId
				) {
					return;
				}

				context.client.handleRealtimeEvent(event);
			},
		}),
		// Empty dependencies is fine here since we use the context parameter
		// which always has fresh data from the memoized realtimeContext
		[]
	);

	useRealtime<SupportRealtimeContext>({
		context: realtimeContext,
		events,
		websiteId: realtimeContext.websiteId,
		visitorId: realtimeContext.visitorId,
	});

	return <>{children}</>;
}
