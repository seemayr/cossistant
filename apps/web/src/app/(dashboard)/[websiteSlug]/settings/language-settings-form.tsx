"use client";

import type { RouterOutputs } from "@cossistant/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UpgradeModal } from "@/components/plan/upgrade-modal";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LanguagePicker } from "@/components/ui/language-picker";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { Switch } from "@/components/ui/switch";
import { normalizeLanguagePickerValue } from "@/lib/language";
import { useTRPC } from "@/lib/trpc/client";

type CurrentPlan = RouterOutputs["plan"]["getPlanInfo"]["plan"];

type LanguageSettingsFormProps = {
	currentPlan: CurrentPlan;
	initialAutoTranslateEnabled: boolean;
	initialDefaultLanguage: string;
	organizationId: string;
	websiteId: string;
	websiteSlug: string;
};

function getNormalizedDefaultLanguage(language: string) {
	return normalizeLanguagePickerValue(language) ?? "en";
}

export function LanguageSettingsForm({
	currentPlan,
	initialAutoTranslateEnabled,
	initialDefaultLanguage,
	organizationId,
	websiteId,
	websiteSlug,
}: LanguageSettingsFormProps) {
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [defaultLanguage, setDefaultLanguage] = useState(() =>
		getNormalizedDefaultLanguage(initialDefaultLanguage)
	);
	const [savedDefaultLanguage, setSavedDefaultLanguage] = useState(() =>
		getNormalizedDefaultLanguage(initialDefaultLanguage)
	);
	const [enabled, setEnabled] = useState(initialAutoTranslateEnabled);
	const [savedEnabled, setSavedEnabled] = useState(initialAutoTranslateEnabled);
	const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

	useEffect(() => {
		const normalizedDefaultLanguage = getNormalizedDefaultLanguage(
			initialDefaultLanguage
		);

		setDefaultLanguage(normalizedDefaultLanguage);
		setSavedDefaultLanguage(normalizedDefaultLanguage);
		setEnabled(initialAutoTranslateEnabled);
		setSavedEnabled(initialAutoTranslateEnabled);
	}, [initialAutoTranslateEnabled, initialDefaultLanguage]);

	const supportsAutoTranslate = currentPlan.features["auto-translate"] === true;
	const canOpenUpgradeModal = currentPlan.name !== "self_hosted";
	const initialUpgradePlanName = currentPlan.name === "free" ? "hobby" : "pro";
	const isLanguageDirty = defaultLanguage !== savedDefaultLanguage;
	const isToggleDirty = supportsAutoTranslate && enabled !== savedEnabled;
	const isDirty = isLanguageDirty || isToggleDirty;

	const { mutateAsync: updateWebsite, isPending } = useMutation(
		trpc.website.update.mutationOptions({
			onSuccess: async (updatedWebsite) => {
				const normalizedDefaultLanguage = getNormalizedDefaultLanguage(
					updatedWebsite.defaultLanguage
				);

				setDefaultLanguage(normalizedDefaultLanguage);
				setSavedDefaultLanguage(normalizedDefaultLanguage);
				setEnabled(updatedWebsite.autoTranslateEnabled);
				setSavedEnabled(updatedWebsite.autoTranslateEnabled);

				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.website.getBySlug.queryKey({
							slug: websiteSlug,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.website.developerSettings.queryKey({
							slug: websiteSlug,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.website.listByOrganization.queryKey({
							organizationId,
						}),
					}),
				]);

				toast.success("Language settings updated.");
				router.refresh();
			},
			onError: (error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update language settings."
				);
			},
		})
	);

	return (
		<>
			<form
				className="space-y-6"
				onSubmit={(event) => {
					event.preventDefault();

					if (!isDirty) {
						return;
					}

					void updateWebsite({
						organizationId,
						websiteId,
						data: {
							defaultLanguage,
							...(supportsAutoTranslate
								? { autoTranslateEnabled: enabled }
								: {}),
						},
					});
				}}
			>
				<div className="space-y-6 p-4">
					<div className="space-y-2">
						<Label htmlFor="default-language">Default language</Label>
						<LanguagePicker
							disabled={isPending}
							id="default-language"
							onChange={setDefaultLanguage}
							value={defaultLanguage}
						/>
						<p className="text-muted-foreground text-sm">
							Choose the main language for your website. Cossistant uses this
							when translating visitor messages, replies, and titles.
						</p>
					</div>

					<div className="flex items-center justify-between gap-6">
						<div className="space-y-1">
							<Label htmlFor="enable-auto-translate">
								Enable auto-translate
							</Label>
							<p className="text-muted-foreground text-sm">
								Automatically translate visitor messages, team replies, AI
								replies, and titles when languages differ.
							</p>
							<p className="text-muted-foreground text-xs">
								Costs 1 AI credit per conversation.
							</p>
						</div>
						<Switch
							checked={enabled}
							disabled={isPending || !supportsAutoTranslate}
							id="enable-auto-translate"
							onCheckedChange={setEnabled}
						/>
					</div>

					{supportsAutoTranslate ? null : (
						<div className="rounded-lg border border-primary/20 border-dashed bg-background-100 p-3">
							<p className="font-medium text-sm">
								Auto-translate is a Pro feature.
							</p>
							<p className="text-muted-foreground text-xs">
								Upgrade to unlock automatic translation for this website while
								keeping the 1 credit per conversation billing model.
							</p>
						</div>
					)}
				</div>

				<SettingsRowFooter className="flex items-center justify-end gap-2">
					{!supportsAutoTranslate && canOpenUpgradeModal ? (
						<Button
							disabled={isPending}
							onClick={() => setIsUpgradeModalOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							Upgrade to Pro
						</Button>
					) : null}
					<BaseSubmitButton
						disabled={!isDirty || isPending}
						isSubmitting={isPending}
						size="sm"
						type="submit"
					>
						Save language settings
					</BaseSubmitButton>
				</SettingsRowFooter>
			</form>

			{canOpenUpgradeModal ? (
				<UpgradeModal
					currentPlan={currentPlan}
					highlightedFeatureKey="auto-translate"
					initialPlanName={initialUpgradePlanName}
					onOpenChange={setIsUpgradeModalOpen}
					open={isUpgradeModalOpen}
					websiteSlug={websiteSlug}
				/>
			) : null}
		</>
	);
}
