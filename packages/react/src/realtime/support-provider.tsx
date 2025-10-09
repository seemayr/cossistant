import type { CossistantClient } from "@cossistant/core";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useVisitorRealtime } from "@cossistant/realtime/client";
import { useSupport } from "../provider";
import { applyConversationSeenEvent } from "./seen-store";
import {
	applyConversationTypingEvent,
	clearTypingFromMessage,
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
}: SupportRealtimeProviderProps) {
        const { website, client, visitor } = useSupport();

        const handleMessageCreated = useCallback(
                (event: RealtimeEvent<"MESSAGE_CREATED">) => {
                        if (website?.id && event.websiteId !== website.id) {
                                return;
                        }

                        clearTypingFromMessage(event);
                        client.handleRealtimeEvent(event);
                },
                [client, website?.id]
        );

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
                        CONVERSATION_SEEN: (
                                _data: RealtimeEvent["payload"],
                                {
					event,
					context,
				}: {
					event: RealtimeEvent<"CONVERSATION_SEEN">;
					context: SupportRealtimeContext;
				}
			) => {
				if (context.websiteId && event.websiteId !== context.websiteId) {
					return;
				}

				// Update the seen store so the UI reflects who has seen messages
				applyConversationSeenEvent(event);
			},
			CONVERSATION_TYPING: (
				_data: RealtimeEvent["payload"],
				{
					event,
					context,
				}: {
					event: RealtimeEvent<"CONVERSATION_TYPING">;
					context: SupportRealtimeContext;
				}
			) => {
				if (context.websiteId && event.websiteId !== context.websiteId) {
					return;
				}

				// Update typing store, but ignore events from the current visitor (their own typing)
				// Note: We use context.visitorId which is fresh from the context object
				applyConversationTypingEvent(event, {
					ignoreVisitorId: context.visitorId,
				});
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
                visitorId: website?.visitor?.id ?? null,
        });

        const { publicKey } = client.getConfiguration();

        const visitorRealtimeEvents = useMemo(
                () => ({
                        message: {
                                created: handleMessageCreated,
                        },
                }),
                [handleMessageCreated]
        );

        useVisitorRealtime({
                websiteId: realtimeContext.websiteId,
                visitorId: realtimeContext.visitorId,
                publicKey: publicKey ?? null,
                events: visitorRealtimeEvents,
        });

        return <>{children}</>;
}
