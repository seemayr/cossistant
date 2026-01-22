"use client";

import { useQueryNormalizer } from "@normy/react-query";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "@/lib/trpc/client";

type UseConversationHeadersOptions = {
	limit?: number;
	enabled?: boolean;
};

const DEFAULT_PAGE_LIMIT = 500;

// 5 minutes
const STALE_TIME = 300_000;

export function useConversationHeaders(
	websiteSlug: string,
	options?: UseConversationHeadersOptions
) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const queryNormalizer = useQueryNormalizer();

	const query = useInfiniteQuery({
		queryKey: [
			...trpc.conversation.listConversationsHeaders.queryOptions({
				websiteSlug,
			}).queryKey,
			{ type: "infinite" },
		],
		queryFn: async ({ pageParam }) => {
			const response = await queryClient.fetchQuery(
				trpc.conversation.listConversationsHeaders.queryOptions({
					websiteSlug,
					limit: options?.limit ?? DEFAULT_PAGE_LIMIT,
					cursor: pageParam ?? null,
				})
			);

			return response;
		},
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: null as string | null,
		enabled: options?.enabled ?? true,
		staleTime: STALE_TIME,
	});

	const conversations = query.data?.pages.flatMap((page) => page.items) ?? [];

	useEffect(() => {
		if (!query.data) {
			return;
		}

		for (const page of query.data.pages) {
			for (const header of page.items) {
				// Type assertion needed because TimelineItemParts contains complex union types
				// that don't fit @normy/react-query's simpler Data type constraints
				queryNormalizer.setNormalizedData(
					header as Parameters<typeof queryNormalizer.setNormalizedData>[0]
				);
			}
		}
	}, [query.data, queryNormalizer]);

	return {
		conversations,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isFetchingNextPage: query.isFetchingNextPage,
		hasNextPage: query.hasNextPage,
		fetchNextPage: query.fetchNextPage,
		error: query.error,
		refetch: query.refetch,
	};
}
