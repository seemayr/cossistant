"use client";

import {
  type RealtimeEventHandlersMap,
  useRealtime,
} from "@cossistant/next/realtime";
import { useQueryNormalizer } from "@normy/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { useUserSession, useWebsite } from "@/contexts/website";
import { handleConversationCreated } from "./events/handlers/conversation-created";
import { handleConversationEventCreated } from "./events/handlers/conversation-event-created";
import { handleConversationSeen } from "./events/handlers/conversation-seen";
import { handleConversationTyping } from "./events/handlers/conversation-typing";
import { handleMessageCreated } from "./events/handlers/message-created";
import type { DashboardRealtimeContext } from "./events/types";

export function Realtime({ children }: { children: ReactNode }) {
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
    [queryClient, queryNormalizer, website.id, website.slug, user?.id],
  );

  const events = useMemo<RealtimeEventHandlersMap<DashboardRealtimeContext>>(
    () => ({
      conversationCreated: [
        (_data, meta) => {
          handleConversationCreated({
            event: meta.event,
            context: meta.context,
          });
        },
      ],
      conversationEventCreated: [
        (_data, meta) => {
          handleConversationEventCreated({
            event: meta.event,
            context: meta.context,
          });
        },
      ],
      messageCreated: [
        (_data, meta) => {
          handleMessageCreated({
            event: meta.event,
            context: meta.context,
          });
        },
      ],
      conversationSeen: [
        (_data, meta) => {
          void handleConversationSeen({
            event: meta.event,
            context: meta.context,
          });
        },
      ],
      conversationTyping: [
        (_data, meta) => {
          handleConversationTyping({
            event: meta.event,
            context: meta.context,
          });
        },
      ],
    }),
    [],
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

  return children;
}
