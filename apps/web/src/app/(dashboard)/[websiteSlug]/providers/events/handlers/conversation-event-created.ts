import type { RouterOutputs } from "@api/trpc/types";
import { upsertConversationEventInCache } from "@/data/conversation-event-cache";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import type { DashboardRealtimeContext } from "../types";

type ConversationEventCreatedEvent = RealtimeEvent<"conversationEventCreated">;

type ConversationEventsQueryInput = {
  conversationId?: string;
  websiteSlug?: string;
};

type QueryKeyInput = {
  input?: ConversationEventsQueryInput;
  type?: string;
};

type ConversationEventItem =
  RouterOutputs["conversation"]["getConversationEvents"]["items"][number];

function toConversationEvent(
  payload: ConversationEventCreatedEvent["payload"],
): ConversationEventItem {
  return {
    ...payload.event,
    metadata: payload.event.metadata
      ? (payload.event.metadata as Record<string, unknown>)
      : undefined,
    message: payload.event.message ?? undefined,
    updatedAt: payload.event.updatedAt ?? payload.event.createdAt,
    deletedAt: payload.event.deletedAt ?? null,
  } satisfies ConversationEventItem;
}

function extractQueryInput(
  queryKey: readonly unknown[],
): ConversationEventsQueryInput | null {
  if (queryKey.length < 2) {
    return null;
  }

  const maybeInput = queryKey[1];
  if (!maybeInput || typeof maybeInput !== "object") {
    return null;
  }

  const input = (maybeInput as QueryKeyInput).input;
  if (!input || typeof input !== "object") {
    return null;
  }

  return input;
}

function isInfiniteQueryKey(queryKey: readonly unknown[]): boolean {
  const marker = queryKey[2];
  return Boolean(
    marker &&
      typeof marker === "object" &&
      "type" in marker &&
      (marker as QueryKeyInput).type === "infinite",
  );
}

export const handleConversationEventCreated = ({
  event,
  context,
}: {
  event: ConversationEventCreatedEvent;
  context: DashboardRealtimeContext;
}) => {
  const { queryClient, website } = context;
  const payload = event.payload;
  const normalizedEvent = toConversationEvent(payload);

  const queries = queryClient
    .getQueryCache()
    .findAll({ queryKey: [["conversation", "getConversationEvents"]] });

  for (const query of queries) {
    const queryKey = query.queryKey as readonly unknown[];

    if (!isInfiniteQueryKey(queryKey)) {
      continue;
    }

    const input = extractQueryInput(queryKey);
    if (!input) {
      continue;
    }

    if (input.conversationId !== payload.conversationId) {
      continue;
    }

    if (input.websiteSlug !== website.slug) {
      continue;
    }

    upsertConversationEventInCache(queryClient, queryKey, normalizedEvent);
  }
};
