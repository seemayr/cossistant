"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { AIAgentForm } from "../ai-agent-form";
import { DeleteAgentDialog } from "../delete-agent-dialog";
import { ToolInvocationBudgetForm } from "./behavior/tool-invocation-budget-form";

export default function AgentsPage() {
	const website = useWebsite();
	const router = useRouter();
	const trpc = useTRPC();
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	// Data is pre-fetched in the layout, so it will be available immediately
	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website.slug,
		})
	);
	const {
		data: behaviorSettings,
		isLoading: isLoadingBehaviorSettings,
		isError: isBehaviorSettingsError,
	} = useQuery({
		...trpc.aiAgent.getBehaviorSettings.queryOptions({
			websiteSlug: website.slug,
		}),
		enabled: Boolean(aiAgent?.onboardingCompletedAt),
	});

	// Redirect to create page if no agent exists OR onboarding not complete
	useEffect(() => {
		if (!aiAgent?.onboardingCompletedAt) {
			router.replace(`/${website.slug}/agent/create`);
		}
	}, [aiAgent, router, website.slug]);

	// Return null while redirecting (no skeleton needed - loading.tsx handles initial load)
	if (!aiAgent?.onboardingCompletedAt) {
		return null;
	}

	return (
		<SettingsPage>
			<SettingsHeader>General Settings</SettingsHeader>
			<PageContent className="py-30">
				<SettingsRow
					description="Configure your AI assistant that automatically responds to visitor messages. When enabled, the agent will help visitors with common questions."
					title="AI Agent Configuration"
				>
					<AIAgentForm
						initialData={aiAgent}
						websiteName={website.name}
						websiteSlug={website.slug}
					/>
				</SettingsRow>

				{isLoadingBehaviorSettings ? (
					<div className="space-y-8">
						<SettingsRow
							description="Loading behavior settings..."
							title="Tool Invocation Budget"
						>
							<div className="space-y-3 p-4">
								<Skeleton className="h-10 w-full" />
							</div>
						</SettingsRow>
					</div>
				) : isBehaviorSettingsError ? (
					<SettingsRow
						description="Control how many non-finish tool invocations the AI can use per run."
						title="Tool Invocation Budget"
					>
						<div className="p-4">
							<p className="text-destructive text-sm">
								Failed to load behavior settings.
							</p>
						</div>
					</SettingsRow>
				) : behaviorSettings ? (
					<SettingsRow
						description="Control how many non-finish tool invocations the AI can use per run."
						title="Tool Invocation Budget"
					>
						<ToolInvocationBudgetForm
							aiAgentId={aiAgent.id}
							initialData={behaviorSettings}
							websiteSlug={website.slug}
						/>
					</SettingsRow>
				) : null}

				<SettingsRow
					description="Permanently delete this AI agent and all associated data. This action cannot be undone."
					title="Danger Zone"
					variant="danger"
				>
					<div className="flex items-center justify-between p-4">
						<div className="space-y-1">
							<p className="font-medium text-sm">Delete AI Agent</p>
							<p className="text-muted-foreground text-xs">
								All knowledge base entries, web sources, and settings will be
								permanently deleted.
							</p>
						</div>
						<Button
							onClick={() => setShowDeleteDialog(true)}
							type="button"
							variant="destructive"
						>
							Delete Agent
						</Button>
					</div>
				</SettingsRow>
			</PageContent>

			<DeleteAgentDialog
				agentId={aiAgent.id}
				agentName={aiAgent.name}
				onOpenChange={setShowDeleteDialog}
				open={showDeleteDialog}
				websiteSlug={website.slug}
			/>
		</SettingsPage>
	);
}
