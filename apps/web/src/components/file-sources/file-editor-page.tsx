"use client";

import type { ArticleKnowledgePayload } from "@cossistant/types";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	SettingsRow,
	SettingsRowFooter,
} from "@/components/ui/layout/settings-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/lib/trpc/client";
import {
	TrainingEntryDetailLayout,
	useTrainingPageState,
} from "../training-entries";
import { FileManualEntryFields } from "./file-manual-entry-fields";
import { FileUploadZone } from "./file-upload-zone";
import { useFileMutations } from "./hooks/use-file-mutations";

type FileEditorPageProps = {
	knowledgeId?: string;
};

type NormalizedFileDraft = {
	title: string;
	summary: string;
	markdown: string;
};

const EMPTY_FILE_DRAFT: NormalizedFileDraft = {
	title: "",
	summary: "",
	markdown: "",
};

function normalizeFileDraft(input: {
	title: string;
	summary: string;
	markdown: string;
}): NormalizedFileDraft {
	return {
		title: input.title.trim(),
		summary: input.summary.trim(),
		markdown: input.markdown.trim(),
	};
}

function areFileDraftsEqual(
	left: NormalizedFileDraft,
	right: NormalizedFileDraft
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function FileEditorPage({ knowledgeId }: FileEditorPageProps) {
	const router = useRouter();
	const trpc = useTRPC();
	const [activeTab, setActiveTab] = useState<"manual" | "upload">("manual");
	const [title, setTitle] = useState("");
	const [summary, setSummary] = useState("");
	const [markdown, setMarkdown] = useState("");
	const [initialDraft, setInitialDraft] =
		useState<NormalizedFileDraft>(EMPTY_FILE_DRAFT);
	const pageState = useTrainingPageState({
		highlightedFeatureKey: "ai-agent-training-files",
	});

	const isCreateMode = !knowledgeId;
	const listHref = `/${pageState.websiteSlug}/agent/training/files`;
	const { data: knowledge, isLoading: isLoadingKnowledge } = useQuery({
		...trpc.knowledge.get.queryOptions({
			websiteSlug: pageState.websiteSlug,
			id: knowledgeId ?? "",
		}),
		enabled: Boolean(knowledgeId),
	});

	const {
		handleCreate,
		handleDelete,
		handleToggleIncluded,
		handleUpdate,
		handleUpload,
		isCreating,
		isDeleting,
		isToggling,
		isUpdating,
		isUploading,
	} = useFileMutations({
		websiteSlug: pageState.websiteSlug,
		aiAgentId: pageState.aiAgentId,
		trainingControls: pageState.trainingControls,
	});

	useEffect(() => {
		if (!knowledge || knowledge.type !== "article") {
			return;
		}

		const payload = knowledge.payload as ArticleKnowledgePayload;
		const nextDraft = normalizeFileDraft({
			title: payload.title,
			summary: payload.summary ?? "",
			markdown: payload.markdown,
		});
		setTitle(payload.title);
		setSummary(payload.summary ?? "");
		setMarkdown(payload.markdown);
		setInitialDraft(nextDraft);
	}, [knowledge]);

	const isAtFileLimit =
		pageState.stats?.planLimitFiles !== null &&
		pageState.stats?.articleKnowledgeCount !== undefined &&
		pageState.stats.articleKnowledgeCount >=
			(pageState.stats.planLimitFiles ?? 0);
	const isSaving = isCreateMode ? isCreating : isUpdating;
	const currentDraft = useMemo(
		() =>
			normalizeFileDraft({
				title,
				summary,
				markdown,
			}),
		[markdown, summary, title]
	);
	const isDirty = !areFileDraftsEqual(currentDraft, initialDraft);
	const isValid = title.trim().length > 0 && markdown.trim().length > 0;
	const isUnavailable =
		!(isCreateMode || isLoadingKnowledge) &&
		(!knowledge || knowledge.type !== "article");
	const headerTitle = useMemo(() => {
		if (title.trim()) {
			return title.trim();
		}

		return isCreateMode ? "New file" : "Untitled file";
	}, [isCreateMode, title]);

	const handleSave = async () => {
		if (!isValid) {
			return;
		}

		if (isCreateMode && isAtFileLimit) {
			pageState.openUpgradeModal();
			return;
		}

		if (isCreateMode) {
			const created = await handleCreate({
				title: currentDraft.title,
				summary: currentDraft.summary || undefined,
				markdown: currentDraft.markdown,
			});
			router.push(
				`/${pageState.websiteSlug}/agent/training/files/${created.id}`
			);
			return;
		}

		if (!knowledgeId) {
			return;
		}

		await handleUpdate(knowledgeId, {
			title: currentDraft.title,
			summary: currentDraft.summary || undefined,
			markdown: currentDraft.markdown,
		});
		setInitialDraft(currentDraft);
	};

	const handleUploadFiles = async (files: File[]) => {
		if (isAtFileLimit) {
			pageState.openUpgradeModal();
			return;
		}

		let lastUploadedId: string | null = null;
		for (const file of files) {
			const uploaded = await handleUpload(file);
			lastUploadedId = uploaded.id;
		}

		if (files.length === 1 && lastUploadedId) {
			router.push(
				`/${pageState.websiteSlug}/agent/training/files/${lastUploadedId}`
			);
			return;
		}

		router.push(listHref);
	};

	const handleDeleteEntry = async () => {
		if (!knowledgeId) {
			return;
		}

		await handleDelete(knowledgeId);
		router.push(listHref);
	};

	const handleToggleEntryIncluded = async () => {
		if (!(knowledgeId && knowledge)) {
			return;
		}

		await handleToggleIncluded(knowledgeId, !knowledge.isIncluded);
	};

	const canSave =
		activeTab === "manual" &&
		isValid &&
		isDirty &&
		!isSaving &&
		!(isCreateMode && isAtFileLimit);

	return (
		<>
			<TrainingEntryDetailLayout backHref={listHref} title={headerTitle}>
				{isUnavailable ? (
					<SettingsRow
						description="This file no longer exists or cannot be edited."
						title="Unavailable"
					>
						<div className="p-4 text-muted-foreground text-sm">
							The selected file could not be loaded.
						</div>
					</SettingsRow>
				) : isCreateMode ? (
					<SettingsRow
						description="Choose how you want to add this training file."
						title="New file"
					>
						<div className="p-4">
							<Tabs
								onValueChange={(value) =>
									setActiveTab(value as "manual" | "upload")
								}
								value={activeTab}
							>
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="manual">Manual entry</TabsTrigger>
									<TabsTrigger value="upload">Upload file</TabsTrigger>
								</TabsList>
								<TabsContent className="pt-4" value="manual">
									<FileManualEntryFields
										disabled={isSaving}
										markdown={markdown}
										onMarkdownChange={setMarkdown}
										onSummaryChange={setSummary}
										onTitleChange={setTitle}
										summary={summary}
										title={title}
									/>
								</TabsContent>
								<TabsContent className="pt-4" value="upload">
									<div className="space-y-2">
										<p className="text-muted-foreground text-sm">
											Upload markdown or text files and we will convert them
											into training entries.
										</p>
									</div>
									<div className="pt-4">
										<FileUploadZone
											disabled={isAtFileLimit}
											isUploading={isUploading}
											onUpload={handleUploadFiles}
										/>
									</div>
								</TabsContent>
							</Tabs>
						</div>
						{activeTab === "manual" ? (
							<SettingsRowFooter className="flex items-center justify-end gap-2">
								<Button
									disabled={!canSave}
									onClick={handleSave}
									size="sm"
									type="button"
								>
									{isSaving ? "Saving..." : "Save"}
								</Button>
							</SettingsRowFooter>
						) : null}
					</SettingsRow>
				) : (
					<SettingsRow
						description="Edit the file title, summary, and markdown your agent should use."
						title="File"
					>
						<div className="p-4">
							<FileManualEntryFields
								disabled={isSaving || isLoadingKnowledge}
								markdown={markdown}
								onMarkdownChange={setMarkdown}
								onSummaryChange={setSummary}
								onTitleChange={setTitle}
								summary={summary}
								title={title}
							/>
						</div>
						<SettingsRowFooter className="flex items-center justify-between gap-3">
							<div className="flex flex-wrap items-center gap-2">
								{knowledge ? (
									<Button
										disabled={isToggling}
										onClick={handleToggleEntryIncluded}
										size="sm"
										type="button"
										variant="ghost"
									>
										{knowledge.isIncluded ? "Exclude" : "Include"}
									</Button>
								) : null}
								<Button
									disabled={isDeleting}
									onClick={handleDeleteEntry}
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
				)}
			</TrainingEntryDetailLayout>
			{pageState.upgradeModal}
		</>
	);
}

export type { FileEditorPageProps };
