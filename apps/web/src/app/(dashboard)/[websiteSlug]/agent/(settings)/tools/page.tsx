"use client";

import type { GetCapabilitiesStudioResponse } from "@cossistant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { buildBehaviorSettingsPatch } from "@/components/agents/skills/tools-studio-utils";
import { Badge } from "@/components/ui/badge";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";

const TOOL_CATEGORY_LABELS: Record<
	GetCapabilitiesStudioResponse["tools"][number]["category"],
	string
> = {
	system: "System Tools",
	messaging: "Messaging",
	action: "Action Tools",
	context: "Context",
	analysis: "Analysis",
};

export default function ToolsPage() {
	const website = useWebsite();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const { data: aiAgent, isLoading: isLoadingAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website.slug,
		})
	);

	const {
		data: studio,
		isLoading: isLoadingStudio,
		isError: isStudioError,
	} = useQuery({
		...trpc.aiAgent.getCapabilitiesStudio.queryOptions({
			websiteSlug: website.slug,
			aiAgentId: aiAgent?.id ?? "",
		}),
		enabled: Boolean(aiAgent?.id),
	});

	useEffect(() => {
		if (!(isLoadingAgent || aiAgent)) {
			router.replace(`/${website.slug}/agent/create`);
		}
	}, [aiAgent, isLoadingAgent, router, website.slug]);

	const invalidateStudio = async () => {
		if (!aiAgent) {
			return;
		}

		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.aiAgent.getCapabilitiesStudio.queryKey({
					websiteSlug: website.slug,
					aiAgentId: aiAgent.id,
				}),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.aiAgent.getBehaviorSettings.queryKey({
					websiteSlug: website.slug,
				}),
			}),
		]);
	};

	const updateBehaviorMutation = useMutation(
		trpc.aiAgent.updateBehaviorSettings.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);

	const groupedTools = useMemo(() => {
		const tools = studio?.tools ?? [];
		return tools.reduce<Record<string, typeof tools>>((accumulator, tool) => {
			if (!accumulator[tool.category]) {
				accumulator[tool.category] = [];
			}
			accumulator[tool.category].push(tool);
			return accumulator;
		}, {});
	}, [studio?.tools]);

	if (!aiAgent || isLoadingAgent) {
		return null;
	}

	const handleToggleTool = async (
		tool: GetCapabilitiesStudioResponse["tools"][number],
		enabled: boolean
	) => {
		if (!tool.behaviorSettingKey) {
			return;
		}

		await updateBehaviorMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			settings: buildBehaviorSettingsPatch(tool.behaviorSettingKey, enabled),
		});
	};

	if (isLoadingStudio) {
		return (
			<SettingsPage>
				<SettingsHeader>Tools</SettingsHeader>
				<PageContent className="py-30">
					<SettingsRow description="Loading tools..." title="Tools">
						<div className="space-y-3 p-4">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					</SettingsRow>
				</PageContent>
			</SettingsPage>
		);
	}

	if (isStudioError || !studio) {
		return (
			<SettingsPage>
				<SettingsHeader>Tools</SettingsHeader>
				<PageContent className="py-30">
					<div className="p-6 text-center text-destructive">
						Failed to load tools.
					</div>
				</PageContent>
			</SettingsPage>
		);
	}

	return (
		<SettingsPage>
			<SettingsHeader>Tools</SettingsHeader>
			<PageContent className="py-30">
				<SettingsRow
					description="Enable or disable capabilities and review always-on system tools."
					title="Tools"
				>
					<div className="space-y-6 p-4">
						{Object.entries(groupedTools).map(([category, tools]) => (
							<div key={category}>
								<h3 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
									{TOOL_CATEGORY_LABELS[
										category as GetCapabilitiesStudioResponse["tools"][number]["category"]
									] ?? category}
								</h3>
								<div className="space-y-3">
									{tools.map((tool) => (
										<div
											className="flex items-start justify-between gap-4 rounded-md border border-border/60 p-3"
											key={tool.id}
										>
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<p className="font-medium text-sm">{tool.label}</p>
													{tool.isSystem && (
														<Badge variant="secondary">System</Badge>
													)}
													{tool.isRequired && (
														<Badge variant="outline">
															<Lock className="mr-1 size-3" />
															Required
														</Badge>
													)}
												</div>
												<p className="text-muted-foreground text-xs">
													{tool.description}
												</p>
											</div>
											{tool.isToggleable ? (
												<Switch
													checked={tool.enabled}
													disabled={updateBehaviorMutation.isPending}
													onCheckedChange={(checked) =>
														void handleToggleTool(tool, checked)
													}
												/>
											) : (
												<p className="pt-1 text-muted-foreground text-xs">
													Always on
												</p>
											)}
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</SettingsRow>
			</PageContent>
		</SettingsPage>
	);
}
