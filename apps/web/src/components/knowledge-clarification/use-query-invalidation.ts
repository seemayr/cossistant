"use client";

import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/lib/trpc/client";

type InvalidateKnowledgeClarificationOptions = {
	request?: KnowledgeClarificationRequest | null;
	includeKnowledgeQueries?: boolean;
};

export function useKnowledgeClarificationQueryInvalidation(
	websiteSlug: string
) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useCallback(
		async ({
			request,
			includeKnowledgeQueries = false,
		}: InvalidateKnowledgeClarificationOptions = {}) => {
			const invalidations: Promise<unknown>[] = [
				queryClient.invalidateQueries({
					queryKey: trpc.knowledgeClarification.listProposals.queryKey({
						websiteSlug,
					}),
				}),
			];

			if (request?.conversationId) {
				invalidations.push(
					queryClient.invalidateQueries({
						queryKey:
							trpc.knowledgeClarification.getActiveForConversation.queryKey({
								websiteSlug,
								conversationId: request.conversationId,
							}),
					})
				);
			}

			if (includeKnowledgeQueries) {
				invalidations.push(
					queryClient.invalidateQueries({
						queryKey: trpc.knowledge.list.queryKey({
							websiteSlug,
							type: "faq",
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.linkSource.getTrainingStats.queryKey({
							websiteSlug,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
							websiteSlug,
						}),
					})
				);
			}

			await Promise.all(invalidations);
		},
		[queryClient, trpc, websiteSlug]
	);
}
