"use client";

import type {
	ArticleKnowledgePayload,
	KnowledgeResponse,
} from "@cossistant/types";
import { useQueryNormalizer } from "@normy/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type { TrainingControls } from "@/hooks/use-training-controls";
import { useTRPC } from "@/lib/trpc/client";

// Regex for removing file extensions
const FILE_EXTENSION_REGEX = /\.(md|txt)$/;

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

type UseFileMutationsOptions = {
	websiteSlug: string;
	aiAgentId: string | null;
	onCreateSuccess?: () => void;
	onUpdateSuccess?: () => void;
	onUploadSuccess?: () => void;
	trainingControls?: TrainingControls;
};

export function useFileMutations({
	websiteSlug,
	aiAgentId,
	onCreateSuccess,
	onUpdateSuccess,
	onUploadSuccess,
	trainingControls,
}: UseFileMutationsOptions) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const queryNormalizer = useQueryNormalizer();

	// Create file mutation (manual entry) with optimistic updates
	const createMutation = useMutation(
		trpc.knowledge.create.mutationOptions({
			onMutate: async (newData) => {
				// Cancel outgoing refetches
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
					}),
				});

				// Snapshot previous value
				const previousData = queryClient.getQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
						aiAgentId,
					})
				);

				// Optimistically add the new file
				queryClient.setQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
						aiAgentId,
					}),
					(old) => {
						if (!old) {
							return old;
						}

						const articlePayload = newData.payload as ArticleKnowledgePayload;
						const optimisticFile = {
							id: `optimistic-${Date.now()}`,
							organizationId: "",
							websiteId: "",
							aiAgentId: aiAgentId ?? null,
							linkSourceId: null,
							type: "article" as const,
							sourceUrl: null,
							sourceTitle: articlePayload.title,
							origin: "manual",
							createdBy: "",
							contentHash: "",
							payload: articlePayload,
							metadata: undefined,
							isIncluded: true,
							sizeBytes: 0,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							deletedAt: null,
						};

						return {
							...old,
							items: [optimisticFile, ...old.items],
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
							type: "article",
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to add file");
			},
			onSuccess: async () => {
				onCreateSuccess?.();

				const autoStarted = trainingControls?.canAutoStartTraining
					? await trainingControls.startTrainingIfAllowed()
					: false;

				if (!autoStarted) {
					toast.success("File added", {
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
						type: "article",
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

	// Upload file mutation
	const uploadMutation = useMutation(
		trpc.knowledge.uploadFile.mutationOptions({
			onMutate: async (newData) => {
				// Cancel outgoing refetches
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
					}),
				});

				// Snapshot previous value
				const previousData = queryClient.getQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
						aiAgentId,
					})
				);

				// Optimistically add the new file
				queryClient.setQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
						aiAgentId,
					}),
					(old) => {
						if (!old) {
							return old;
						}

						const optimisticFile = {
							id: `optimistic-${Date.now()}`,
							organizationId: "",
							websiteId: "",
							aiAgentId: aiAgentId ?? null,
							linkSourceId: null,
							type: "article" as const,
							sourceUrl: null,
							sourceTitle: newData.fileName.replace(FILE_EXTENSION_REGEX, ""),
							origin: "file-upload",
							createdBy: "",
							contentHash: "",
							payload: {
								title: newData.fileName.replace(FILE_EXTENSION_REGEX, ""),
								summary: null,
								markdown: newData.fileContent,
								keywords: [],
							},
							metadata: undefined,
							isIncluded: true,
							sizeBytes: new TextEncoder().encode(newData.fileContent).length,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							deletedAt: null,
						};

						return {
							...old,
							items: [optimisticFile, ...old.items],
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
							type: "article",
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to upload file");
			},
			onSuccess: async (data) => {
				onUploadSuccess?.();

				const autoStarted = trainingControls?.canAutoStartTraining
					? await trainingControls.startTrainingIfAllowed()
					: false;

				if (!autoStarted) {
					toast.success(`File uploaded: ${data.sourceTitle}`, {
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
						type: "article",
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

	// Update file mutation with Normy optimistic updates
	const updateMutation = useMutation(
		trpc.knowledge.update.mutationOptions({
			onMutate: async ({ id, payload, sourceTitle }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
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
							payload:
								(payload as ArticleKnowledgePayload) ?? existingItem.payload,
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
				toast.error(_error.message || "Failed to update file");
			},
			onSuccess: (data) => {
				// Update normalized cache with server response
				queryNormalizer.setNormalizedData(toNormyData(data));
				toast.success("File updated");
				onUpdateSuccess?.();
			},
			onSettled: () => {
				// Invalidate list to ensure fresh data after update
				void queryClient.invalidateQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
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

	// Delete file mutation with optimistic updates
	const deleteMutation = useMutation(
		trpc.knowledge.delete.mutationOptions({
			onMutate: async ({ id }) => {
				await queryClient.cancelQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
					}),
				});

				const previousData = queryClient.getQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
						aiAgentId,
					})
				);

				// Optimistically remove the file
				queryClient.setQueryData(
					trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
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
							type: "article",
							aiAgentId,
						}),
						context.previousData
					);
				}
				toast.error(_error.message || "Failed to delete file");
			},
			onSuccess: () => {
				toast.success("File deleted");
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.knowledge.list.queryKey({
						websiteSlug,
						type: "article",
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
						type: "article",
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
		async (params: { title: string; markdown: string; summary?: string }) => {
			const payload: ArticleKnowledgePayload = {
				title: params.title,
				summary: params.summary ?? null,
				markdown: params.markdown,
				keywords: [],
			};

			await createMutation.mutateAsync({
				websiteSlug,
				aiAgentId: aiAgentId ?? undefined,
				type: "article",
				sourceTitle: params.title,
				origin: "manual",
				payload,
			});
		},
		[createMutation, websiteSlug, aiAgentId]
	);

	const handleUpload = useCallback(
		async (file: File) => {
			const content = await file.text();
			const match = file.name.match(FILE_EXTENSION_REGEX);
			if (!match) {
				throw new Error(
					"Unsupported file type. Only .md and .txt files are allowed."
				);
			}
			const extension = match[1] as "md" | "txt";

			await uploadMutation.mutateAsync({
				websiteSlug,
				aiAgentId: aiAgentId ?? undefined,
				fileName: file.name,
				fileContent: content,
				fileExtension: extension,
			});
		},
		[uploadMutation, websiteSlug, aiAgentId]
	);

	const handleUpdate = useCallback(
		async (
			id: string,
			params: { title: string; markdown: string; summary?: string }
		) => {
			const payload: ArticleKnowledgePayload = {
				title: params.title,
				summary: params.summary ?? null,
				markdown: params.markdown,
				keywords: [],
			};

			await updateMutation.mutateAsync({
				websiteSlug,
				id,
				sourceTitle: params.title,
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
		uploadMutation,
		updateMutation,
		deleteMutation,
		toggleIncludedMutation,

		// Handlers
		handleCreate,
		handleUpload,
		handleUpdate,
		handleDelete,
		handleToggleIncluded,

		// States
		isCreating: createMutation.isPending,
		isUploading: uploadMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isToggling: toggleIncludedMutation.isPending,
	};
}
