"use client";

import type { KnowledgeResponse } from "@cossistant/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { TrainingEmptyState } from "@/components/agents/training-empty-state";
import {
	AddFileDialog,
	EditFileDialog,
	FileList,
	useFileMutations,
} from "@/components/file-sources";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
} from "@/components/ui/layout/settings-layout";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { useWebsite } from "@/contexts/website";
import { useTrainingControls } from "@/hooks/use-training-controls";
import { useTRPC } from "@/lib/trpc/client";

export default function FilesPage() {
	const website = useWebsite();
	const trpc = useTRPC();
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showUpgradeModal, setShowUpgradeModal] = useState(false);
	const [editingFile, setEditingFile] = useState<KnowledgeResponse | null>(
		null
	);

	// Data is pre-fetched in the layout, so it will be available immediately
	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website.slug,
		})
	);

	// Fetch plan info
	const { data: planInfo } = useQuery(
		trpc.plan.getPlanInfo.queryOptions({ websiteSlug: website.slug })
	);

	// Fetch training stats
	const { data: stats } = useQuery(
		trpc.linkSource.getTrainingStats.queryOptions({
			websiteSlug: website.slug,
			aiAgentId: aiAgent?.id ?? null,
		})
	);

	const trainingControls = useTrainingControls({
		aiAgentId: aiAgent?.id ?? null,
		onBlocked: () => {
			setShowUpgradeModal(true);
		},
		websiteSlug: website.slug,
	});

	const isFreePlan = planInfo?.plan.name === "free";

	// Check if user is at file limit
	const isAtFileLimit =
		stats?.planLimitFiles !== null &&
		stats?.articleKnowledgeCount !== undefined &&
		stats.articleKnowledgeCount >= (stats.planLimitFiles ?? 0);

	const handleOpenCreate = useCallback(() => {
		if (isAtFileLimit) {
			setShowUpgradeModal(true);
			return;
		}

		setShowAddDialog(true);
	}, [isAtFileLimit]);

	// Mutations hook
	const {
		handleCreate,
		handleUpload,
		handleUpdate,
		handleDelete,
		handleToggleIncluded,
		isCreating,
		isUploading,
		isUpdating,
		isDeleting,
		isToggling,
	} = useFileMutations({
		websiteSlug: website.slug,
		aiAgentId: aiAgent?.id ?? null,
		onCreateSuccess: () => {
			setShowAddDialog(false);
		},
		onUploadSuccess: () => {
			// Don't close the dialog on upload success so user can upload more files
		},
		onUpdateSuccess: () => {
			setEditingFile(null);
		},
		trainingControls,
	});

	const handleAddFile = useCallback(
		async (params: { title: string; markdown: string; summary?: string }) => {
			await handleCreate(params);
		},
		[handleCreate]
	);

	const handleUploadFiles = useCallback(
		async (files: File[]) => {
			for (const file of files) {
				await handleUpload(file);
			}
		},
		[handleUpload]
	);

	const handleEditFile = useCallback(
		async (
			id: string,
			params: { title: string; markdown: string; summary?: string }
		) => {
			await handleUpdate(id, params);
		},
		[handleUpdate]
	);

	return (
		<SettingsPage>
			<SettingsHeader>
				Files
				<div className="flex items-center gap-2 pr-1">
					<TooltipOnHover content="Add file">
						<Button
							aria-label="Add file"
							onClick={handleOpenCreate}
							size="sm"
							type="button"
							variant="secondary"
						>
							<Icon filledOnHover name="plus" />
							Add file
						</Button>
					</TooltipOnHover>
				</div>
			</SettingsHeader>
			<PageContent className="py-6 pt-20">
				<div className="space-y-6">
					{/* Stats info */}
					{stats && stats.planLimitFiles !== null && (
						<div className="flex items-center justify-between text-sm">
							<p className="text-muted-foreground">
								<span className="font-medium">
									{stats.articleKnowledgeCount}
								</span>{" "}
								/ {stats.planLimitFiles} Files
							</p>
							{isFreePlan && (
								<button
									className="font-medium text-cossistant-orange hover:cursor-pointer hover:underline"
									onClick={() => setShowUpgradeModal(true)}
									type="button"
								>
									Upgrade for unlimited files
								</button>
							)}
						</div>
					)}

					{/* File List */}
					{aiAgent && (
						<FileList
							aiAgentId={aiAgent.id}
							emptyState={
								<TrainingEmptyState
									actionLabel="Add file"
									description="Add a file to give your agent more context."
									onAction={handleOpenCreate}
									title="No files yet"
								/>
							}
							isDeleting={isDeleting}
							isToggling={isToggling}
							onDelete={handleDelete}
							onEdit={setEditingFile}
							onToggleIncluded={handleToggleIncluded}
							websiteSlug={website.slug}
						/>
					)}
				</div>
			</PageContent>

			{/* Add File Dialog */}
			<AddFileDialog
				fileLimit={stats?.planLimitFiles}
				isAtLimit={isAtFileLimit}
				isSubmitting={isCreating}
				isUploading={isUploading}
				onOpenChange={setShowAddDialog}
				onSubmit={handleAddFile}
				onUpgradeClick={() => setShowUpgradeModal(true)}
				onUpload={handleUploadFiles}
				open={showAddDialog}
				websiteSlug={website.slug}
			/>

			{/* Edit File Dialog */}
			<EditFileDialog
				file={editingFile}
				isSubmitting={isUpdating}
				onOpenChange={(open) => !open && setEditingFile(null)}
				onSubmit={handleEditFile}
				open={editingFile !== null}
			/>

			{/* Upgrade Modal */}
			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="ai-agent-training-files"
					initialPlanName="hobby"
					onOpenChange={setShowUpgradeModal}
					open={showUpgradeModal}
					websiteSlug={website.slug}
				/>
			)}
		</SettingsPage>
	);
}
