"use client";

import type { FaqKnowledgePayload, KnowledgeResponse } from "@cossistant/types";
import { useQueryNormalizer } from "@normy/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type { TrainingControls } from "@/hooks/use-training-controls";
import { useTRPC } from "@/lib/trpc/client";

// Type for Normy's normalized data - derived from the hook return type
type QueryNormalizer = ReturnType<typeof useQueryNormalizer>;
type NormyData = Parameters<QueryNormalizer["setNormalizedData"]>[0];

/**
 * Helper to cast KnowledgeResponse to Normy's Data type.
 * This is needed because KnowledgeResponse has union types in payload
 * that TypeScript can't reconcile with Normy's recursive Data type.
 */
function toNormyData(data: KnowledgeResponse): NormyData {
	return data as unknown as NormyData;
}

type UseFaqMutationsOptions = {
	websiteSlug: string;
	aiAgentId: string | null;
	onCreateSuccess?: () => void;
	onUpdateSuccess?: () => void;
	trainingControls?: TrainingControls;
};

export function useFaqMutations({
	websiteSlug,
	aiAgentId,
	onCreateSuccess,
	onUpdateSuccess,
	trainingControls,
}: UseFaqMutationsOptions) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const queryNormalizer = useQueryNormalizer();

	// Create FAQ mutation with optimistic updates
	const createMutation = useMutation(
		trpc.knowledge.create.mutationOptions({
			onMutate: async (newData) => {
				// Cancel outgoing refetches
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
					}),
				});

				// Snapshot previous value
				const previousData = queryClient.getQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
						aiAgentId,
					})
				);

				// Optimistically add the new FAQ
				queryClient.setQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
						aiAgentId,
					}),
					(old) => {
						if (!old) {
							return old;
						}

						const faqPayload = newData.payload as FaqKnowledgePayload;
						const optimisticFaq = {
							id: `optimistic-${Date.now()}`,
							organizationId: "",
							websiteId: "",
							aiAgentId: aiAgentId ?? null,
							linkSourceId: null,
							type: "faq" as const,
							sourceUrl: null,
							sourceTitle: faqPayload.question,
							origin: "manual",
							createdBy: "",
							contentHash: "",
							payload: faqPayload,
							metadata: undefined,
							isIncluded: true,
							sizeBytes: 0,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							deletedAt: null,
						};

						return {
							...old,
							items: [optimisticFaq, ...old.items],
							pagination: {
								...old.pagination,
								total: old.pagination.total + 1,
							},
						};
					}
				);

				return { previousData };
			},
			onError: (_error, _variables, context) => {
				// Rollback on error
				if (context?.previousData) {
					queryClient.setQueryData(
						trpc.knowledge.list.queryKey({
							websiteSlug,
							type: "faq",
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to add FAQ");
			},
			onSuccess: async () => {
				onCreateSuccess?.();

				const autoStarted = trainingControls?.canAutoStartTraining
					? await trainingControls.startTrainingIfAllowed()
					: false;

				if (!autoStarted) {
					toast.success("FAQ added", {
						...(trainingControls?.canRequestTraining && {
							action: {
								label: "Train Agent",
								onClick: () => {
									void trainingControls.requestTraining();
								},
							},
						}),
					});
				}
			},
			onSettled: () => {
				// Refetch after mutation
				void queryClient.invalidateQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Update FAQ mutation with Normy optimistic updates
	const updateMutation = useMutation(
		trpc.knowledge.update.mutationOptions({
			onMutate: async ({ id, payload, sourceTitle }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
					}),
				});

				// Get existing item from Normy's normalized cache
				const existingItem = queryNormalizer.getObjectById(id) as
					| KnowledgeResponse
					| undefined;

				// Build optimistic data with the updated fields
				const optimisticData: KnowledgeResponse | null = existingItem
					? {
							...existingItem,
							payload: (payload as FaqKnowledgePayload) ?? existingItem.payload,
							sourceTitle: sourceTitle ?? existingItem.sourceTitle,
							updatedAt: new Date().toISOString(),
						}
					: null;

				// Apply optimistic update via Normy - this updates all queries containing this item
				if (optimisticData) {
					queryNormalizer.setNormalizedData(toNormyData(optimisticData));
				}

				// Return context for rollback
				return {
					optimisticData,
					rollbackData: existingItem,
				};
			},
			onError: (_error, _variables, context) => {
				// Rollback on error using Normy
				if (context?.rollbackData) {
					queryNormalizer.setNormalizedData(toNormyData(context.rollbackData));
				}
				toast.error(_error.message || "Failed to update FAQ");
			},
			onSuccess: (data) => {
				// Update normalized cache with server response
				queryNormalizer.setNormalizedData(toNormyData(data));
				toast.success("FAQ updated");
				onUpdateSuccess?.();
			},
			onSettled: () => {
				// Invalidate list to ensure fresh data after update
				void queryClient.invalidateQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Delete FAQ mutation with optimistic updates
	const deleteMutation = useMutation(
		trpc.knowledge.delete.mutationOptions({
			onMutate: async ({ id }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
					}),
				});

				const previousData = queryClient.getQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
						aiAgentId,
					})
				);

				// Optimistically remove the FAQ
				queryClient.setQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
						aiAgentId,
					}),
					(old) => {
						if (!old) {
							return old;
						}

						return {
							...old,
							items: old.items.filter((item) => item.id !== id),
							pagination: {
								...old.pagination,
								total: Math.max(0, old.pagination.total - 1),
							},
						};
					}
				);

				return { previousData };
			},
			onError: (_error, _variables, context) => {
				if (context?.previousData) {
					queryClient.setQueryData(
						trpc.knowledge.list.queryKey({
							websiteSlug,
							type: "faq",
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to delete FAQ");
			},
			onSuccess: () => {
				toast.success("FAQ deleted");
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Toggle included mutation with Normy optimistic updates
	const toggleIncludedMutation = useMutation(
		trpc.knowledge.toggleIncluded.mutationOptions({
			onMutate: async ({ id, isIncluded }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "faq",
					}),
				});

				// Get existing item from Normy's normalized cache
				const existingItem = queryNormalizer.getObjectById(id) as
					| KnowledgeResponse
					| undefined;

				// Build optimistic data
				const optimisticData: KnowledgeResponse | null = existingItem
					? {
							...existingItem,
							isIncluded,
						}
					: null;

				// Apply optimistic update via Normy
				if (optimisticData) {
					queryNormalizer.setNormalizedData(toNormyData(optimisticData));
				}

				return {
					optimisticData,
					rollbackData: existingItem,
				};
			},
			onError: (_error, _variables, context) => {
				// Rollback on error using Normy
				if (context?.rollbackData) {
					queryNormalizer.setNormalizedData(toNormyData(context.rollbackData));
				}
				toast.error(_error.message || "Failed to toggle inclusion");
			},
			onSuccess: (data) => {
				// Get the full item and update with server response
				const existingItem = queryNormalizer.getObjectById(data.id) as
					| KnowledgeResponse
					| undefined;
				if (existingItem) {
					queryNormalizer.setNormalizedData(
						toNormyData({
							...existingItem,
							isIncluded: data.isIncluded,
						})
					);
				}
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.linkSource.getTrainingStats.queryKey({
						websiteSlug,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
						websiteSlug,
					}),
				});
			},
		})
	);

	// Callback handlers
	const handleCreate = useCallback(
		async (params: {
			question: string;
			answer: string;
			categories?: string[];
		}) => {
			const payload: FaqKnowledgePayload = {
				question: params.question,
				answer: params.answer,
				categories: params.categories ?? [],
				relatedQuestions: [],
			};

			await createMutation.mutateAsync({
				websiteSlug,
				aiAgentId: aiAgentId ?? undefined,
				type: "faq",
				sourceTitle: params.question,
				origin: "manual",
				payload,
			});
		},
		[createMutation, websiteSlug, aiAgentId]
	);

	const handleUpdate = useCallback(
		async (
			id: string,
			params: {
				question: string;
				answer: string;
				categories?: string[];
			}
		) => {
			const payload: FaqKnowledgePayload = {
				question: params.question,
				answer: params.answer,
				categories: params.categories ?? [],
				relatedQuestions: [],
			};

			await updateMutation.mutateAsync({
				websiteSlug,
				id,
				sourceTitle: params.question,
				payload,
			});
		},
		[updateMutation, websiteSlug]
	);

	const handleDelete = useCallback(
		async (id: string) => {
			await deleteMutation.mutateAsync({
				websiteSlug,
				id,
			});
		},
		[deleteMutation, websiteSlug]
	);

	const handleToggleIncluded = useCallback(
		async (id: string, isIncluded: boolean) => {
			await toggleIncludedMutation.mutateAsync({
				websiteSlug,
				id,
				isIncluded,
			});
		},
		[toggleIncludedMutation, websiteSlug]
	);

	return {
		// Mutations
		createMutation,
		updateMutation,
		deleteMutation,
		toggleIncludedMutation,

		// Handlers
		handleCreate,
		handleUpdate,
		handleDelete,
		handleToggleIncluded,

		// States
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isToggling: toggleIncludedMutation.isPending,
	};
}
