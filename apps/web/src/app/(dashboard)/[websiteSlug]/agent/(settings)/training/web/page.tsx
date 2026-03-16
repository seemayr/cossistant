"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { TrainingEmptyState } from "@/components/agents/training-empty-state";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
} from "@/components/ui/layout/settings-layout";
import { TooltipOnHover } from "@/components/ui/tooltip";
import {
	AddWebsiteDialog,
	DomainTree,
	KnowledgePreviewWrapper,
	UsageStatsCard,
	useLinkSourceMutations,
	useUsageStats,
} from "@/components/web-sources";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";

export default function WebSourcesPage() {
	const website = useWebsite();
	const trpc = useTRPC();
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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

	const isFreePlan = planInfo?.plan.name === "free";

	// Get usage stats for limit checks
	const { stats, isAtLinkLimit } = useUsageStats({
		websiteSlug: website.slug,
		aiAgentId: aiAgent?.id ?? null,
	});

	// Check if user is at pages limit
	const isAtPagesLimit =
		stats?.totalPagesLimit !== null &&
		stats?.urlKnowledgeCount !== undefined &&
		stats.urlKnowledgeCount >= (stats.totalPagesLimit ?? 0);

	// User cannot add more URLs if at link limit or pages limit
	const isAtAnyLimit = isAtLinkLimit || isAtPagesLimit;

	const handleOpenCreate = useCallback(() => {
		if (isAtAnyLimit) {
			setShowUpgradeModal(true);
			return;
		}

		setShowAddDialog(true);
	}, [isAtAnyLimit]);

	// Mutations hook for creating link sources
	const { handleCreate, isCreating } = useLinkSourceMutations({
		websiteSlug: website.slug,
		aiAgentId: aiAgent?.id ?? null,
		onCreateSuccess: () => {
			setShowAddDialog(false);
		},
	});

	const handleAddWebsite = useCallback(
		async (params: {
			url: string;
			includePaths?: string[];
			excludePaths?: string[];
		}) => {
			await handleCreate(params);
		},
		[handleCreate]
	);

	return (
		<SettingsPage>
			<SettingsHeader>
				Web Sources
				<div className="flex items-center gap-2 pr-1">
					<TooltipOnHover content="Add website">
						<Button
							aria-label="Add website"
							onClick={handleOpenCreate}
							size="sm"
							type="button"
							variant="secondary"
						>
							<Icon filledOnHover name="plus" />
							Add website
						</Button>
					</TooltipOnHover>
				</div>
			</SettingsHeader>
			<PageContent className="py-6 pt-20">
				<div className="space-y-6">
					{/* Stats Overview */}
					{aiAgent && (
						<UsageStatsCard aiAgentId={aiAgent.id} websiteSlug={website.slug} />
					)}

					{/* Always-visible upgrade banner for free plan users */}
					{isFreePlan && stats && stats.totalPagesLimit !== null && (
						<div className="flex items-center justify-end text-cossistant-orange text-sm">
							<button
								className="font-medium underline hover:no-underline"
								onClick={() => setShowUpgradeModal(true)}
								type="button"
							>
								Upgrade for 1,000+ pages
							</button>
						</div>
					)}

					{/* Domain Tree - Unified hierarchical view */}
					{aiAgent && (
						<DomainTree
							aiAgentId={aiAgent.id}
							emptyState={
								<TrainingEmptyState
									actionLabel="Add website"
									description="Add a website and we'll crawl it for your agent."
									onAction={handleOpenCreate}
									title="No websites yet"
								/>
							}
							websiteSlug={website.slug}
						/>
					)}
				</div>
			</PageContent>

			{/* Add Website Dialog */}
			<AddWebsiteDialog
				crawlPagesLimit={stats?.crawlPagesPerSourceLimit}
				isAtLinkLimit={isAtLinkLimit}
				isFreePlan={isFreePlan}
				isSubmitting={isCreating}
				linkLimit={stats?.planLimitLinks}
				onOpenChange={setShowAddDialog}
				onSubmit={handleAddWebsite}
				onUpgradeClick={() => setShowUpgradeModal(true)}
				open={showAddDialog}
				websiteSlug={website.slug}
			/>

			{/* Knowledge Preview Modal */}
			<KnowledgePreviewWrapper websiteSlug={website.slug} />

			{/* Upgrade Modal */}
			{planInfo && (
				<UpgradeModal
					currentPlan={planInfo.plan}
					highlightedFeatureKey="ai-agent-training-pages-total"
					initialPlanName="hobby"
					onOpenChange={setShowUpgradeModal}
					open={showUpgradeModal}
					websiteSlug={website.slug}
				/>
			)}
		</SettingsPage>
	);
}
