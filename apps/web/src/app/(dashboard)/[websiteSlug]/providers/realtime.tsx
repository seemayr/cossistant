"use client";

import {
	type RealtimeEventHandlersMap,
	useRealtime,
} from "@cossistant/next/realtime";
import { useDashboardRealtime } from "@cossistant/realtime/client";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import { useQueryNormalizer } from "@normy/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { useUserSession, useWebsite } from "@/contexts/website";
import { handleConversationCreated } from "./events/handlers/conversation-created";
import { handleConversationSeen } from "./events/handlers/conversation-seen";
import { handleConversationTyping } from "./events/handlers/conversation-typing";
import { handleMessageCreated } from "./events/handlers/message-created";
import type { DashboardRealtimeContext } from "./events/types";

export function DashboardRealtimeProvider({
	children,
}: {
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const queryNormalizer = useQueryNormalizer();
	const website = useWebsite();
	const { user } = useUserSession();

	const realtimeContext = useMemo<DashboardRealtimeContext>(
		() => ({
			queryClient,
			queryNormalizer,
			website: {
				id: website.id,
				slug: website.slug,
			},
			userId: user?.id ?? null,
		}),
		[queryClient, queryNormalizer, website.id, website.slug, user?.id]
	);

	const events = useMemo<RealtimeEventHandlersMap<DashboardRealtimeContext>>(
		() => ({
			CONVERSATION_CREATED: [
				(_data, meta) => {
					handleConversationCreated({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			CONVERSATION_SEEN: [
				(_data, meta) => {
					void handleConversationSeen({
						event: meta.event,
						context: meta.context,
					});
				},
			],
			CONVERSATION_TYPING: [
				(_data, meta) => {
					handleConversationTyping({
						event: meta.event,
						context: meta.context,
					});
				},
			],
		}),
		[]
	);

	useRealtime<DashboardRealtimeContext>({
		context: realtimeContext,
		websiteId: website.id,
		events,
		onEventError: (error, event) => {
			console.error("[DashboardRealtime] handler failed", {
				error,
				eventType: event.type,
			});
		},
	});

        const dashboardRealtimeEvents = useMemo(
                () => ({
                        message: {
                                created: (event: RealtimeEvent<"MESSAGE_CREATED">) => {
                                        handleMessageCreated(event.payload, {
                                                event,
                                                context: realtimeContext,
                                        });
                                },
                        },
                }),
                [handleMessageCreated, realtimeContext]
        );

        useDashboardRealtime({
                websiteId: website.id,
                events: dashboardRealtimeEvents,
        });

        return children;
}
