"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
import { BackgroundAnalysisForm } from "./background-analysis-form";
import { VisitorContactForm } from "./visitor-contact-form";

export default function BehaviorPage() {
	const website = useWebsite();
	const router = useRouter();
	const trpc = useTRPC();

	const { data: aiAgent, isLoading: isLoadingAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website.slug,
		})
	);

	// Fetch behavior settings
	const {
		data: behaviorSettings,
		isLoading: isLoadingSettings,
		isError: isSettingsError,
	} = useQuery({
		...trpc.aiAgent.getBehaviorSettings.queryOptions({
			websiteSlug: website.slug,
		}),
		enabled: !!aiAgent,
	});

	// Redirect to create page if no agent exists
	useEffect(() => {
		if (!(isLoadingAgent || aiAgent)) {
			router.replace(`/${website.slug}/agent/create`);
		}
	}, [aiAgent, isLoadingAgent, router, website.slug]);

	if (!aiAgent || isLoadingAgent) {
		return null;
	}

	const isLoading = isLoadingSettings;

	return (
		<SettingsPage>
			<SettingsHeader>Behavior Settings</SettingsHeader>
			<PageContent className="py-30">
				{isLoading ? (
					<div className="space-y-8">
						<SettingsRow
							description="Loading settings..."
							title="Background Analysis"
						>
							<div className="space-y-6 p-4">
								<Skeleton className="h-10 w-full" />
								<Skeleton className="h-10 w-full" />
							</div>
						</SettingsRow>
					</div>
				) : isSettingsError ? (
					<div className="p-8 text-center">
						<p className="text-destructive">
							Failed to load behavior settings. Please try again.
						</p>
						<Button
							className="mt-4"
							onClick={() => window.location.reload()}
							variant="outline"
						>
							Reload Page
						</Button>
					</div>
				) : behaviorSettings ? (
					<div className="space-y-8">
						<SettingsRow
							description="Enable automatic analysis that runs silently in the background."
							title="Background Analysis"
						>
							<BackgroundAnalysisForm
								aiAgentId={aiAgent.id}
								initialData={behaviorSettings}
								websiteSlug={website.slug}
							/>
						</SettingsRow>

						<SettingsRow
							description="Controls how aggressively the AI asks for name and email."
							title="Get Visitor Contact"
						>
							<VisitorContactForm
								aiAgentId={aiAgent.id}
								initialData={behaviorSettings}
								websiteSlug={website.slug}
							/>
						</SettingsRow>
					</div>
				) : null}
			</PageContent>
		</SettingsPage>
	);
}
