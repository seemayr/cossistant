"use client";

import type { KnowledgeResponse } from "@cossistant/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
	AddFaqDialog,
	EditFaqDialog,
	FaqList,
	useFaqMutations,
} from "@/components/faq-sources";
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

export default function FaqPage() {
	const website = useWebsite();
	const trpc = useTRPC();
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showUpgradeModal, setShowUpgradeModal] = useState(false);
	const [editingFaq, setEditingFaq] = useState<KnowledgeResponse | null>(null);

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

	// Check if user is at FAQ limit
	const isAtFaqLimit =
		stats?.planLimitFaqs !== null &&
		stats?.faqKnowledgeCount !== undefined &&
		stats.faqKnowledgeCount >= (stats.planLimitFaqs ?? 0);

	// Mutations hook
	const {
		handleCreate,
		handleUpdate,
		handleDelete,
		handleToggleIncluded,
		isCreating,
		isUpdating,
		isDeleting,
		isToggling,
	} = useFaqMutations({
		websiteSlug: website.slug,
		aiAgentId: aiAgent?.id ?? null,
		onCreateSuccess: () => {
			setShowAddDialog(false);
		},
		onUpdateSuccess: () => {
			setEditingFaq(null);
		},
		trainingControls,
	});

	const handleAddFaq = useCallback(
		async (params: {
			question: string;
			answer: string;
			categories?: string[];
		}) => {
			await handleCreate(params);
		},
		[handleCreate]
	);

	const handleEditFaq = useCallback(
		async (
			id: string,
			params: {
				question: string;
				answer: string;
				categories?: string[];
			}
		) => {
			await handleUpdate(id, params);
		},
		[handleUpdate]
	);

	return (
		<SettingsPage>
			<SettingsHeader>
				FAQ
				<div className="flex items-center gap-2 pr-1">
					<TooltipOnHover content="Add FAQ">
						<Button
							aria-label="Add FAQ"
							onClick={() =>
								isAtFaqLimit
									? setShowUpgradeModal(true)
									: setShowAddDialog(true)
							}
							size="sm"
							type="button"
							variant="secondary"
						>
							<Icon filledOnHover name="plus" />
							Add FAQ
						</Button>
					</TooltipOnHover>
				</div>
			</SettingsHeader>
			<PageContent className="py-6 pt-20">
				<div className="space-y-6">
					{/* Stats info */}
					{stats && stats.planLimitFaqs !== null && (
						<div className="flex items-center justify-between text-sm">
							<p className="text-muted-foreground">
								<span className="font-medium">{stats.faqKnowledgeCount}</span> /{" "}
								{stats.planLimitFaqs} FAQs
							</p>
							{isFreePlan && (
								<button
									className="font-medium text-cossistant-orange hover:cursor-pointer hover:underline"
									onClick={() => setShowUpgradeModal(true)}
									type="button"
								>
									Upgrade for unlimited FAQs
								</button>
							)}
						</div>
					)}

					{/* FAQ List */}
					{aiAgent && (
						<FaqList
							aiAgentId={aiAgent.id}
							isDeleting={isDeleting}
							isToggling={isToggling}
							onDelete={handleDelete}
							onEdit={setEditingFaq}
							onToggleIncluded={handleToggleIncluded}
							websiteSlug={website.slug}
						/>
					)}
				</div>
			</PageContent>

			{/* Add FAQ Dialog */}
			<AddFaqDialog
				faqLimit={stats?.planLimitFaqs}
				isAtLimit={isAtFaqLimit}
				isSubmitting={isCreating}
				onOpenChange={setShowAddDialog}
				onSubmit={handleAddFaq}
				onUpgradeClick={() => setShowUpgradeModal(true)}
				open={showAddDialog}
				websiteSlug={website.slug}
			/>

			{/* Edit FAQ Dialog */}
			<EditFaqDialog
				faq={editingFaq}
				isSubmitting={isUpdating}
				onOpenChange={(open) => !open && setEditingFaq(null)}
				onSubmit={handleEditFaq}
				open={editingFaq !== null}
			/>

			{/* Upgrade Modal */}
			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="ai-agent-training-faqs"
					initialPlanName="hobby"
					onOpenChange={setShowUpgradeModal}
					open={showUpgradeModal}
					websiteSlug={website.slug}
				/>
			)}
		</SettingsPage>
	);
}
