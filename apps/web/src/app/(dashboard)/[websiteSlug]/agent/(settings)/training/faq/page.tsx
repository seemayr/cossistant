"use client";

import type {
	ApproveKnowledgeClarificationDraftResponse,
	KnowledgeClarificationRequest,
	KnowledgeClarificationStepResponse,
	KnowledgeResponse,
} from "@cossistant/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { TrainingEmptyState } from "@/components/agents/training-empty-state";
import {
	AddFaqDialog,
	EditFaqDialog,
	FaqList,
	useFaqMutations,
} from "@/components/faq-sources";
import { KnowledgeClarificationDialog } from "@/components/knowledge-clarification/dialog";
import { stepFromKnowledgeClarificationRequest } from "@/components/knowledge-clarification/helpers";
import { KnowledgeClarificationProposalsSection } from "@/components/knowledge-clarification/proposals-section";
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
	const [clarificationStep, setClarificationStep] =
		useState<KnowledgeClarificationStepResponse | null>(null);
	const [clarificationRequest, setClarificationRequest] =
		useState<KnowledgeClarificationRequest | null>(null);
	const [isClarificationOpen, setIsClarificationOpen] = useState(false);

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
	const { data: proposalsData } = useQuery(
		trpc.knowledgeClarification.listProposals.queryOptions({
			websiteSlug: website.slug,
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
	const proposals = proposalsData?.items ?? [];

	const startClarificationMutation = useMutation(
		trpc.knowledgeClarification.startFromFaq.mutationOptions({
			onSuccess: (result) => {
				setClarificationStep(result.step);
				setClarificationRequest(result.step.request);
				setIsClarificationOpen(true);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to start FAQ clarification");
			},
		})
	);

	// Check if user is at FAQ limit
	const isAtFaqLimit =
		stats?.planLimitFaqs !== null &&
		stats?.faqKnowledgeCount !== undefined &&
		stats.faqKnowledgeCount >= (stats.planLimitFaqs ?? 0);

	const handleOpenCreate = useCallback(() => {
		if (isAtFaqLimit) {
			setShowUpgradeModal(true);
			return;
		}

		setShowAddDialog(true);
	}, [isAtFaqLimit]);

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

	const handleDeepenFaq = useCallback(
		(faq: KnowledgeResponse) => {
			void startClarificationMutation.mutateAsync({
				websiteSlug: website.slug,
				knowledgeId: faq.id,
			});
		},
		[startClarificationMutation, website.slug]
	);

	const handleOpenProposal = useCallback(
		(request: KnowledgeClarificationRequest) => {
			setClarificationStep(stepFromKnowledgeClarificationRequest(request));
			setClarificationRequest(request);
			setIsClarificationOpen(true);
		},
		[]
	);

	const handleClarificationApproved = useCallback(
		async (_result: ApproveKnowledgeClarificationDraftResponse) => {
			const autoStarted = trainingControls.canAutoStartTraining
				? await trainingControls.startTrainingIfAllowed()
				: false;
			if (!autoStarted && trainingControls.canRequestTraining) {
				toast.success("Draft approved", {
					action: {
						label: "Train Agent",
						onClick: () => {
							void trainingControls.requestTraining();
						},
					},
				});
			}
		},
		[trainingControls]
	);

	return (
		<SettingsPage>
			<SettingsHeader>
				FAQ
				<div className="flex items-center gap-2 pr-1">
					<TooltipOnHover content="Add FAQ">
						<Button
							aria-label="Add FAQ"
							onClick={handleOpenCreate}
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
							emptyState={
								<TrainingEmptyState
									actionLabel="Add FAQ"
									description="Add a FAQ so your agent can answer common questions."
									onAction={handleOpenCreate}
									title="No FAQs yet"
								/>
							}
							isDeleting={isDeleting}
							isToggling={isToggling}
							onDeepen={handleDeepenFaq}
							onDelete={handleDelete}
							onEdit={setEditingFaq}
							onToggleIncluded={handleToggleIncluded}
							websiteSlug={website.slug}
						/>
					)}

					<KnowledgeClarificationProposalsSection
						onOpenProposal={handleOpenProposal}
						proposals={proposals}
					/>
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

			<KnowledgeClarificationDialog
				initialRequest={clarificationRequest}
				initialStep={clarificationStep}
				onApproved={handleClarificationApproved}
				onOpenChange={setIsClarificationOpen}
				open={isClarificationOpen}
				websiteSlug={website.slug}
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
