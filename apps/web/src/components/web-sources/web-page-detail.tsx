"use client";

import type { UrlKnowledgePayload } from "@cossistant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	SettingsRow,
	SettingsRowFooter,
} from "@/components/ui/layout/settings-layout";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { TrainingEntryDetailLayout } from "../training-entries";

type WebPageDetailProps = {
	knowledgeId: string;
};

type NormalizedWebDraft = {
	sourceTitle: string;
	markdown: string;
};

const EMPTY_WEB_DRAFT: NormalizedWebDraft = {
	sourceTitle: "",
	markdown: "",
};

function normalizeWebDraft(input: {
	sourceTitle: string;
	markdown: string;
}): NormalizedWebDraft {
	return {
		sourceTitle: input.sourceTitle.trim(),
		markdown: input.markdown.trim(),
	};
}

function areWebDraftsEqual(
	left: NormalizedWebDraft,
	right: NormalizedWebDraft
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function WebPageDetail({ knowledgeId }: WebPageDetailProps) {
	const website = useWebsite();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [sourceTitle, setSourceTitle] = useState("");
	const [markdown, setMarkdown] = useState("");
	const [initialDraft, setInitialDraft] =
		useState<NormalizedWebDraft>(EMPTY_WEB_DRAFT);

	const listHref = `/${website.slug}/agent/training/web`;

	const { data: knowledge, isLoading } = useQuery(
		trpc.knowledge.get.queryOptions({
			websiteSlug: website.slug,
			id: knowledgeId,
		})
	);

	const saveMutation = useMutation(
		trpc.knowledge.update.mutationOptions({
			onSuccess: async (updated) => {
				toast.success("Page updated");
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.knowledge.get.queryKey({
							websiteSlug: website.slug,
							id: updated.id,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.knowledge.list.queryKey({
							websiteSlug: website.slug,
							type: "url",
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.linkSource.getTrainingStats.queryKey({
							websiteSlug: website.slug,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
							websiteSlug: website.slug,
						}),
					}),
				]);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to update page");
			},
		})
	);

	const toggleIncludedMutation = useMutation(
		trpc.knowledge.toggleIncluded.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.knowledge.get.queryKey({
							websiteSlug: website.slug,
							id: knowledgeId,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.linkSource.getTrainingStats.queryKey({
							websiteSlug: website.slug,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
							websiteSlug: website.slug,
						}),
					}),
				]);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to toggle inclusion");
			},
		})
	);

	const deleteMutation = useMutation(
		trpc.knowledge.delete.mutationOptions({
			onSuccess: async () => {
				toast.success("Page deleted");
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.knowledge.list.queryKey({
							websiteSlug: website.slug,
							type: "url",
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.linkSource.getTrainingStats.queryKey({
							websiteSlug: website.slug,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
							websiteSlug: website.slug,
						}),
					}),
				]);
				router.push(listHref);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to delete page");
			},
		})
	);

	const reindexMutation = useMutation(
		trpc.linkSource.reindexPage.mutationOptions({
			onSuccess: async (data) => {
				toast.success(`Re-indexed: ${data.sourceTitle ?? data.sourceUrl}`);
				if (!knowledge?.linkSourceId) {
					return;
				}

				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.knowledge.get.queryKey({
							websiteSlug: website.slug,
							id: knowledgeId,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.linkSource.listKnowledgeByLinkSource.queryKey({
							websiteSlug: website.slug,
							linkSourceId: knowledge.linkSourceId,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.linkSource.getTrainingStats.queryKey({
							websiteSlug: website.slug,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
							websiteSlug: website.slug,
						}),
					}),
				]);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to re-index page");
			},
		})
	);

	useEffect(() => {
		if (!knowledge || knowledge.type !== "url") {
			return;
		}

		const payload = knowledge.payload as UrlKnowledgePayload;
		const nextDraft = normalizeWebDraft({
			sourceTitle: knowledge.sourceTitle ?? "",
			markdown: payload.markdown,
		});
		setSourceTitle(knowledge.sourceTitle ?? "");
		setMarkdown(payload.markdown);
		setInitialDraft(nextDraft);
	}, [knowledge]);

	const headerTitle = useMemo(() => {
		if (sourceTitle.trim()) {
			return sourceTitle.trim();
		}

		return knowledge?.sourceUrl ?? "Web page";
	}, [knowledge?.sourceUrl, sourceTitle]);
	const isSaving = saveMutation.isPending;
	const currentDraft = useMemo(
		() =>
			normalizeWebDraft({
				sourceTitle,
				markdown,
			}),
		[markdown, sourceTitle]
	);
	const isDirty = !areWebDraftsEqual(currentDraft, initialDraft);
	const canSave = markdown.trim().length > 0 && isDirty && !isSaving;

	const handleSave = async () => {
		if (!(knowledge && knowledge.type === "url" && canSave)) {
			return;
		}

		const payload = knowledge.payload as UrlKnowledgePayload;
		await saveMutation.mutateAsync({
			websiteSlug: website.slug,
			id: knowledge.id,
			sourceTitle: currentDraft.sourceTitle || null,
			payload: {
				...payload,
				markdown: currentDraft.markdown,
			},
		});
		setInitialDraft(currentDraft);
	};

	const handleToggleIncluded = async () => {
		if (!knowledge) {
			return;
		}

		await toggleIncludedMutation.mutateAsync({
			websiteSlug: website.slug,
			id: knowledge.id,
			isIncluded: !knowledge.isIncluded,
		});
	};

	const handleDelete = async () => {
		await deleteMutation.mutateAsync({
			websiteSlug: website.slug,
			id: knowledgeId,
		});
	};

	const handleReindex = async () => {
		if (!knowledge?.linkSourceId) {
			return;
		}

		await reindexMutation.mutateAsync({
			websiteSlug: website.slug,
			linkSourceId: knowledge.linkSourceId,
			knowledgeId: knowledge.id,
		});
	};

	if (!isLoading && (!knowledge || knowledge.type !== "url")) {
		return (
			<TrainingEntryDetailLayout backHref={listHref} title="Page not found">
				<SettingsRow
					description="This crawled page no longer exists or cannot be opened."
					title="Unavailable"
				>
					<div className="p-4 text-muted-foreground text-sm">
						The selected page could not be loaded.
					</div>
				</SettingsRow>
			</TrainingEntryDetailLayout>
		);
	}

	return (
		<TrainingEntryDetailLayout backHref={listHref} title={headerTitle}>
			<SettingsRow
				description="Edit the page title and markdown content your agent should use."
				title="Page"
			>
				<div className="space-y-4 p-4">
					<div className="space-y-2">
						<Label htmlFor="web-source-title">Page title</Label>
						<Input
							disabled={isLoading || isSaving}
							id="web-source-title"
							onChange={(event) => setSourceTitle(event.target.value)}
							placeholder="Getting Started"
							value={sourceTitle}
						/>
					</div>
					<div className="space-y-2">
						<div className="font-medium text-sm">Source URL</div>
						{knowledge?.sourceUrl ? (
							<div className="flex flex-wrap items-center gap-3 text-sm">
								<a
									className="min-w-0 truncate text-primary underline"
									href={knowledge.sourceUrl}
									rel="noopener noreferrer"
									target="_blank"
								>
									{knowledge.sourceUrl}
								</a>
								<Button asChild size="sm" variant="ghost">
									<a
										href={knowledge.sourceUrl}
										rel="noopener noreferrer"
										target="_blank"
									>
										<ExternalLinkIcon className="size-4" />
										Open original
									</a>
								</Button>
							</div>
						) : (
							<p className="text-muted-foreground text-sm">
								No source URL saved.
							</p>
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="web-markdown">Markdown</Label>
						<Textarea
							className="min-h-[320px] font-mono text-sm"
							disabled={isLoading || isSaving}
							id="web-markdown"
							onChange={(event) => setMarkdown(event.target.value)}
							placeholder="# Page content"
							rows={14}
							value={markdown}
						/>
					</div>
				</div>
				<SettingsRowFooter className="flex items-center justify-between gap-3">
					<div className="flex flex-wrap items-center gap-2">
						{knowledge ? (
							<Button
								disabled={toggleIncludedMutation.isPending}
								onClick={handleToggleIncluded}
								size="sm"
								type="button"
								variant="ghost"
							>
								{knowledge.isIncluded ? "Exclude" : "Include"}
							</Button>
						) : null}
						<Button
							disabled={reindexMutation.isPending || !knowledge?.linkSourceId}
							onClick={handleReindex}
							size="sm"
							type="button"
							variant="ghost"
						>
							{reindexMutation.isPending ? (
								<>
									<Spinner className="size-4" />
									Re-indexing...
								</>
							) : (
								<>
									<RefreshCwIcon className="size-4" />
									Re-index
								</>
							)}
						</Button>
						<Button
							disabled={deleteMutation.isPending}
							onClick={handleDelete}
							size="sm"
							type="button"
							variant="ghost"
						>
							Delete
						</Button>
					</div>
					<Button
						disabled={!canSave}
						onClick={handleSave}
						size="sm"
						type="button"
					>
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</SettingsRowFooter>
			</SettingsRow>
		</TrainingEntryDetailLayout>
	);
}

export type { WebPageDetailProps };
