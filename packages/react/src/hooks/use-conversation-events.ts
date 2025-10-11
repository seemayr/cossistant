import type { ConversationEventsState } from "@cossistant/core";
import type {
  GetConversationEventsRequest,
  GetConversationEventsResponse,
} from "@cossistant/types/api/conversation";
import { useCallback, useMemo } from "react";
import { useSupport } from "../provider";
import { useStoreSelector } from "./private/store/use-store-selector";
import { useClientQuery } from "./private/use-client-query";

const EMPTY_STATE: ConversationEventsState = {
  events: [],
  hasNextPage: false,
  nextCursor: undefined,
};

const DEFAULT_LIMIT = 50;

export type UseConversationEventsOptions = {
  limit?: number;
  cursor?: string | null;
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

export type UseConversationEventsResult = ConversationEventsState & {
  isLoading: boolean;
  error: Error | null;
  refetch: (
    args?: Pick<GetConversationEventsRequest, "cursor" | "limit">,
  ) => Promise<GetConversationEventsResponse | undefined>;
  fetchNextPage: () => Promise<GetConversationEventsResponse | undefined>;
};

export function useConversationEvents(
  conversationId: string,
  options: UseConversationEventsOptions = {},
): UseConversationEventsResult {
  const { client } = useSupport();
  const store = client.conversationEventsStore;

  const selection = useStoreSelector(store, (state) => {
    return state.conversations[conversationId] ?? EMPTY_STATE;
  });

  const baseArgs = useMemo(() => {
    return {
      limit: options.limit ?? DEFAULT_LIMIT,
      cursor: options.cursor ?? undefined,
    } satisfies Pick<GetConversationEventsRequest, "limit" | "cursor">;
  }, [options.cursor, options.limit]);

  const {
    refetch: queryRefetch,
    isLoading: queryLoading,
    error,
  } = useClientQuery<
    GetConversationEventsResponse,
    Pick<GetConversationEventsRequest, "cursor" | "limit">
  >({
    client,
    queryFn: (instance, args) =>
      instance.getConversationEvents({
        conversationId,
        limit: args?.limit ?? baseArgs.limit,
        cursor: args?.cursor ?? baseArgs.cursor,
      }),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? true,
    refetchOnMount: selection.events.length === 0,
    initialArgs: baseArgs,
    dependencies: [conversationId, baseArgs.limit, baseArgs.cursor ?? null],
  });

  const refetch = useCallback(
    (args?: Pick<GetConversationEventsRequest, "cursor" | "limit">) => {
      return queryRefetch({
        limit: baseArgs.limit,
        cursor: baseArgs.cursor,
        ...args,
      });
    },
    [queryRefetch, baseArgs],
  );

  const fetchNextPage = useCallback(() => {
    if (!(selection.hasNextPage && selection.nextCursor)) {
      return Promise.resolve(undefined);
    }

    return refetch({ cursor: selection.nextCursor });
  }, [selection.hasNextPage, selection.nextCursor, refetch]);

  const isInitialLoad = selection.events.length === 0;
  const isLoading = isInitialLoad ? queryLoading : false;

  return {
    events: selection.events,
    hasNextPage: selection.hasNextPage,
    nextCursor: selection.nextCursor,
    isLoading,
    error,
    refetch,
    fetchNextPage,
  };
}
