"use client";

import type { GetBehaviorStudioResponse } from "@cossistant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
	SettingsRowFooter,
} from "@/components/ui/layout/settings-layout";
import { PromptInput } from "@/components/ui/prompt-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";

type BehaviorEntry = GetBehaviorStudioResponse["behaviors"][number];

export default function BehaviorPage() {
	const website = useWebsite();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [drafts, setDrafts] = useState<Record<string, string>>({});

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
		...trpc.aiAgent.getBehaviorStudio.queryOptions({
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

	useEffect(() => {
		if (!studio) {
			return;
		}

		setDrafts(
			Object.fromEntries(
				studio.behaviors.map((behavior) => [behavior.id, behavior.content])
			)
		);
	}, [studio]);

	const invalidateBehaviorStudio = async () => {
		if (!aiAgent) {
			return;
		}

		await queryClient.invalidateQueries({
			queryKey: trpc.aiAgent.getBehaviorStudio.queryKey({
				websiteSlug: website.slug,
				aiAgentId: aiAgent.id,
			}),
		});
	};

	const upsertBehaviorPromptMutation = useMutation(
		trpc.aiAgent.upsertBehaviorPrompt.mutationOptions({
			onSuccess: () => {
				toast.success("Behaviour saved");
				void invalidateBehaviorStudio();
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save behaviour");
			},
		})
	);

	const resetBehaviorPromptMutation = useMutation(
		trpc.aiAgent.resetBehaviorPrompt.mutationOptions({
			onSuccess: () => {
				toast.success("Behaviour reset to default");
				void invalidateBehaviorStudio();
			},
			onError: (error) => {
				toast.error(error.message || "Failed to reset behaviour");
			},
		})
	);

	const isMutating =
		upsertBehaviorPromptMutation.isPending ||
		resetBehaviorPromptMutation.isPending;

	const behaviors = useMemo(() => studio?.behaviors ?? [], [studio?.behaviors]);

	const getDraft = (behavior: BehaviorEntry) =>
		drafts[behavior.id] ?? behavior.content;

	const handleApplyPreset = (
		behavior: BehaviorEntry,
		presetContent: string
	): void => {
		setDrafts((current) => ({
			...current,
			[behavior.id]: presetContent,
		}));
	};

	const handleSave = async (behavior: BehaviorEntry) => {
		if (!aiAgent) {
			return;
		}

		const draft = getDraft(behavior).trim();
		if (!draft) {
			toast.error("Behaviour content cannot be empty");
			return;
		}

		await upsertBehaviorPromptMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			behaviorId: behavior.id,
			content: draft,
		});
	};

	const handleReset = async (behavior: BehaviorEntry) => {
		if (!aiAgent) {
			return;
		}

		setDrafts((current) => ({
			...current,
			[behavior.id]: behavior.defaultContent,
		}));

		if (!behavior.hasOverride) {
			return;
		}

		await resetBehaviorPromptMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			behaviorId: behavior.id,
		});
	};

	if (!aiAgent || isLoadingAgent) {
		return null;
	}

	if (isLoadingStudio) {
		return (
			<SettingsPage>
				<SettingsHeader>Behaviour</SettingsHeader>
				<PageContent className="py-30">
					<div className="space-y-8">
						{Array.from({ length: 2 }).map((_, index) => (
							<SettingsRow
								description="Loading behaviour..."
								key={index}
								title="Behaviour"
							>
								<div className="space-y-3 p-4">
									<Skeleton className="h-8 w-1/3" />
									<Skeleton className="h-28 w-full" />
									<Skeleton className="h-8 w-40" />
								</div>
							</SettingsRow>
						))}
					</div>
				</PageContent>
			</SettingsPage>
		);
	}

	if (isStudioError || !studio) {
		return (
			<SettingsPage>
				<SettingsHeader>Behaviour</SettingsHeader>
				<PageContent className="py-30">
					<SettingsRow
						description="Something went wrong while loading behavior prompts."
						title="Unable to load"
					>
						<div className="p-4">
							<p className="text-destructive text-sm">
								Failed to load behaviour studio.
							</p>
						</div>
					</SettingsRow>
				</PageContent>
			</SettingsPage>
		);
	}

	return (
		<SettingsPage>
			<SettingsHeader>Behaviour</SettingsHeader>
			<PageContent className="py-30">
				{behaviors.map((behavior) => {
					const draft = getDraft(behavior);
					const isDirty = draft !== behavior.content;
					const isDraftDefault =
						draft.trim() === behavior.defaultContent.trim();

					return (
						<SettingsRow
							description={behavior.description}
							key={behavior.id}
							title={behavior.label}
						>
							<PromptInput
								className="border-none"
								disabled={isMutating}
								maxLength={50_000}
								onChange={(value) =>
									setDrafts((current) => ({
										...current,
										[behavior.id]: value,
									}))
								}
								rows={12}
								value={draft}
							/>

							<SettingsRowFooter className="flex items-center justify-between gap-2">
								<p className="text-muted-foreground text-xs">
									{behavior.hasOverride
										? "Using custom behavior override"
										: "Using default behavior"}
									{isDraftDefault ? " (default draft)" : " (custom draft)"}
								</p>
								<div className="flex items-center gap-2">
									<Button
										disabled={isMutating}
										onClick={() => void handleReset(behavior)}
										size="sm"
										type="button"
										variant="outline"
									>
										Reset
									</Button>
									<BaseSubmitButton
										disabled={!(isDirty && draft.trim())}
										isSubmitting={isMutating}
										onClick={() => void handleSave(behavior)}
										size="sm"
										type="button"
									>
										Save
									</BaseSubmitButton>
								</div>
							</SettingsRowFooter>
						</SettingsRow>
					);
				})}
			</PageContent>
		</SettingsPage>
	);
}
