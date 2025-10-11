import type { RouterOutputs } from "@api/trpc/types";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";

export type ConversationEventsPage =
  RouterOutputs["conversation"]["getConversationEvents"];
export type ConversationEventItem = ConversationEventsPage["items"][number];

function sortEventsByCreatedAt(
  events: ConversationEventItem[],
): ConversationEventItem[] {
  return [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function initializeInfiniteData(
  event: ConversationEventItem,
  existing?: InfiniteData<ConversationEventsPage>,
): InfiniteData<ConversationEventsPage> {
  const firstPageParam =
    existing && existing.pageParams.length > 0 ? existing.pageParams[0] : null;

  return {
    pages: [
      {
        items: [event],
        nextCursor: null,
        hasNextPage: false,
      },
    ],
    pageParams: [firstPageParam],
  };
}

function upsertEventInInfiniteData(
  existing: InfiniteData<ConversationEventsPage> | undefined,
  event: ConversationEventItem,
): InfiniteData<ConversationEventsPage> {
  if (!existing || existing.pages.length === 0) {
    return initializeInfiniteData(event, existing);
  }

  let eventExists = false;

  const pages = existing.pages.map((page, pageIndex) => {
    const currentItems = [...page.items];
    const existingIndex = currentItems.findIndex(
      (item) => item.id === event.id,
    );

    if (existingIndex !== -1) {
      eventExists = true;
      currentItems[existingIndex] = event;
      return {
        ...page,
        items: sortEventsByCreatedAt(currentItems),
      };
    }

    if (!eventExists && pageIndex === existing.pages.length - 1) {
      return {
        ...page,
        items: sortEventsByCreatedAt([...currentItems, event]),
      };
    }

    return page;
  });

  return {
    pages,
    pageParams: [...existing.pageParams],
  };
}

export function createConversationEventsInfiniteQueryKey(
  baseQueryKey: readonly unknown[],
) {
  return [...baseQueryKey, { type: "infinite" }] as const;
}

export function upsertConversationEventInCache(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  event: ConversationEventItem,
) {
  queryClient.setQueryData<InfiniteData<ConversationEventsPage>>(
    queryKey,
    (existing) => upsertEventInInfiniteData(existing, event),
  );
}
