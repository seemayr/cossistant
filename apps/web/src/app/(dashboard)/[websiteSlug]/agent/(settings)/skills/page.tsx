"use client";

import type { GetCapabilitiesStudioResponse } from "@cossistant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SkillMarkdownEditor } from "@/components/agents/skills/skill-markdown-editor";
import { normalizeSkillFileName } from "@/components/agents/skills/tools-studio-utils";
import { Badge } from "@/components/ui/badge";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
	SettingsRowFooter,
} from "@/components/ui/layout/settings-layout";
import { PromptEditModal } from "@/components/ui/prompt-edit-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type SkillEditorTarget =
	| { kind: "template"; templateName: string }
	| { kind: "custom"; skillId: string }
	| { kind: "system"; skillName: string }
	| { kind: "create-custom" }
	| null;

export default function SkillsPage() {
	const website = useWebsite();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [newSkillName, setNewSkillName] = useState("");
	const [newSkillContent, setNewSkillContent] = useState(
		"## New Skill\n\nDescribe when and how this skill should be used."
	);

	const [templateDrafts, setTemplateDrafts] = useState<Record<string, string>>(
		{}
	);
	const [customSkillDrafts, setCustomSkillDrafts] = useState<
		Record<string, string>
	>({});
	const [systemDrafts, setSystemDrafts] = useState<Record<string, string>>({});
	const [editorTarget, setEditorTarget] = useState<SkillEditorTarget>(null);

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

	useEffect(() => {
		if (!studio) {
			return;
		}

		setTemplateDrafts(
			Object.fromEntries(
				studio.defaultSkillTemplates.map((template) => [
					template.name,
					template.content,
				])
			)
		);
		setCustomSkillDrafts(
			Object.fromEntries(
				studio.skillDocuments.map((skill) => [skill.id, skill.content])
			)
		);
		setSystemDrafts(
			Object.fromEntries(
				studio.systemSkillDocuments.map((skill) => [skill.name, skill.content])
			)
		);
	}, [studio]);

	const invalidateStudio = async () => {
		if (!aiAgent) {
			return;
		}

		await queryClient.invalidateQueries({
			queryKey: trpc.aiAgent.getCapabilitiesStudio.queryKey({
				websiteSlug: website.slug,
				aiAgentId: aiAgent.id,
			}),
		});
	};

	const createSkillMutation = useMutation(
		trpc.aiAgent.createSkillDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);

	const updateSkillMutation = useMutation(
		trpc.aiAgent.updateSkillDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);

	const toggleSkillMutation = useMutation(
		trpc.aiAgent.toggleSkillDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);

	const deleteSkillMutation = useMutation(
		trpc.aiAgent.deleteSkillDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);

	const upsertCoreMutation = useMutation(
		trpc.aiAgent.upsertCoreDocument.mutationOptions({
			onSuccess: () => {
				void invalidateStudio();
			},
		})
	);

	const isMutating =
		createSkillMutation.isPending ||
		updateSkillMutation.isPending ||
		toggleSkillMutation.isPending ||
		deleteSkillMutation.isPending ||
		upsertCoreMutation.isPending;

	const toolMentionOptions = useMemo(
		() =>
			(studio?.tools ?? []).map((tool) => ({
				id: tool.id,
				name: tool.label,
				description: tool.description,
			})),
		[studio?.tools]
	);

	const templateNameSet = useMemo(
		() =>
			new Set((studio?.defaultSkillTemplates ?? []).map((item) => item.name)),
		[studio?.defaultSkillTemplates]
	);

	const customSkills = useMemo(
		() =>
			(studio?.skillDocuments ?? []).filter(
				(skill) => !templateNameSet.has(skill.name)
			),
		[studio?.skillDocuments, templateNameSet]
	);

	const activeTemplate = useMemo(() => {
		if (!(studio && editorTarget?.kind === "template")) {
			return null;
		}
		return (
			studio.defaultSkillTemplates.find(
				(template) => template.name === editorTarget.templateName
			) ?? null
		);
	}, [editorTarget, studio]);

	const activeCustomSkill = useMemo(() => {
		if (!(studio && editorTarget?.kind === "custom")) {
			return null;
		}
		return (
			studio.skillDocuments.find(
				(skill) => skill.id === editorTarget.skillId
			) ?? null
		);
	}, [editorTarget, studio]);

	const activeSystemSkill = useMemo(() => {
		if (!(studio && editorTarget?.kind === "system")) {
			return null;
		}
		return (
			studio.systemSkillDocuments.find(
				(skill) => skill.name === editorTarget.skillName
			) ?? null
		);
	}, [editorTarget, studio]);

	const editorTitle = useMemo(() => {
		if (editorTarget?.kind === "template") {
			return activeTemplate?.label ?? "Edit Template";
		}
		if (editorTarget?.kind === "custom") {
			return activeCustomSkill?.name ?? "Edit Skill";
		}
		if (editorTarget?.kind === "system") {
			return activeSystemSkill?.label ?? "Edit System Skill";
		}
		if (editorTarget?.kind === "create-custom") {
			return "Create Custom Skill";
		}
		return "Skill Editor";
	}, [activeCustomSkill, activeSystemSkill, activeTemplate, editorTarget]);

	if (!aiAgent || isLoadingAgent) {
		return null;
	}

	const handleEnableTemplate = async (
		template: GetCapabilitiesStudioResponse["defaultSkillTemplates"][number],
		enabled: boolean
	) => {
		const content = templateDrafts[template.name] ?? template.content;

		if (template.skillDocumentId) {
			await updateSkillMutation.mutateAsync({
				websiteSlug: website.slug,
				aiAgentId: aiAgent.id,
				skillDocumentId: template.skillDocumentId,
				enabled,
				content,
			});
			return;
		}

		await createSkillMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			name: template.name,
			content,
			enabled,
			priority: 0,
		});
	};

	const handleDeleteTemplateForAgent = async (
		template: GetCapabilitiesStudioResponse["defaultSkillTemplates"][number]
	) => {
		const content = templateDrafts[template.name] ?? template.content;
		if (template.skillDocumentId) {
			await updateSkillMutation.mutateAsync({
				websiteSlug: website.slug,
				aiAgentId: aiAgent.id,
				skillDocumentId: template.skillDocumentId,
				enabled: false,
				content,
			});
			return;
		}

		await createSkillMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			name: template.name,
			content,
			enabled: false,
			priority: 0,
		});
	};

	const handleSaveTemplateOverride = async (
		template: GetCapabilitiesStudioResponse["defaultSkillTemplates"][number]
	) => {
		const content = templateDrafts[template.name] ?? template.content;
		if (template.skillDocumentId) {
			await updateSkillMutation.mutateAsync({
				websiteSlug: website.slug,
				aiAgentId: aiAgent.id,
				skillDocumentId: template.skillDocumentId,
				content,
			});
			return;
		}

		await createSkillMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			name: template.name,
			content,
			enabled: false,
			priority: 0,
		});
	};

	const handleResetTemplate = async (
		template: GetCapabilitiesStudioResponse["defaultSkillTemplates"][number]
	) => {
		if (!template.skillDocumentId) {
			return;
		}

		await deleteSkillMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			skillDocumentId: template.skillDocumentId,
		});
	};

	const handleCreateCustomSkill = async () => {
		const normalizedName = normalizeSkillFileName(newSkillName);
		if (!(normalizedName && newSkillContent.trim())) {
			return;
		}

		await createSkillMutation.mutateAsync({
			websiteSlug: website.slug,
			aiAgentId: aiAgent.id,
			name: normalizedName,
			content: newSkillContent,
			enabled: true,
			priority: 0,
		});

		setNewSkillName("");
		setNewSkillContent(
			"## New Skill\n\nDescribe when and how this skill should be used."
		);
		setEditorTarget(null);
	};

	if (isLoadingStudio) {
		return (
			<SettingsPage>
				<SettingsHeader>Skills</SettingsHeader>
				<PageContent className="py-30">
					<div className="space-y-8">
						{Array.from({ length: 3 }).map((_, index) => (
							<SettingsRow
								description="Loading skills studio..."
								key={index}
								title={`Section ${index + 1}`}
							>
								<div className="space-y-3 p-4">
									<Skeleton className="h-10 w-full" />
									<Skeleton className="h-10 w-full" />
									<Skeleton className="h-10 w-full" />
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
				<SettingsHeader>Skills</SettingsHeader>
				<PageContent className="py-30">
					<div className="p-6 text-center text-destructive">
						Failed to load skills.
					</div>
				</PageContent>
			</SettingsPage>
		);
	}

	const modalBody = (() => {
		if (editorTarget?.kind === "template") {
			if (!activeTemplate) {
				return (
					<p className="p-3 text-muted-foreground text-sm">
						Template not found.
					</p>
				);
			}

			return (
				<SkillMarkdownEditor
					disabled={isMutating}
					onChange={(nextValue) =>
						setTemplateDrafts((current) => ({
							...current,
							[activeTemplate.name]: nextValue,
						}))
					}
					rows={20}
					toolMentions={toolMentionOptions}
					value={templateDrafts[activeTemplate.name] ?? activeTemplate.content}
				/>
			);
		}

		if (editorTarget?.kind === "custom") {
			if (!activeCustomSkill) {
				return (
					<p className="p-3 text-muted-foreground text-sm">Skill not found.</p>
				);
			}

			return (
				<SkillMarkdownEditor
					disabled={isMutating}
					onChange={(nextValue) =>
						setCustomSkillDrafts((current) => ({
							...current,
							[activeCustomSkill.id]: nextValue,
						}))
					}
					rows={20}
					toolMentions={toolMentionOptions}
					value={
						customSkillDrafts[activeCustomSkill.id] ?? activeCustomSkill.content
					}
				/>
			);
		}

		if (editorTarget?.kind === "system") {
			if (!activeSystemSkill) {
				return (
					<p className="p-3 text-muted-foreground text-sm">
						System skill not found.
					</p>
				);
			}

			return (
				<SkillMarkdownEditor
					disabled={isMutating}
					onChange={(nextValue) =>
						setSystemDrafts((current) => ({
							...current,
							[activeSystemSkill.name]: nextValue,
						}))
					}
					rows={20}
					toolMentions={toolMentionOptions}
					value={
						systemDrafts[activeSystemSkill.name] ?? activeSystemSkill.content
					}
				/>
			);
		}

		if (editorTarget?.kind === "create-custom") {
			return (
				<div className="space-y-3 p-2">
					<Input
						disabled={isMutating}
						onChange={(event) => setNewSkillName(event.target.value)}
						placeholder="refund-playbook.md"
						value={newSkillName}
					/>
					<SkillMarkdownEditor
						disabled={isMutating}
						onChange={setNewSkillContent}
						rows={16}
						toolMentions={toolMentionOptions}
						value={newSkillContent}
					/>
				</div>
			);
		}

		return null;
	})();

	const modalFooter = (() => {
		if (editorTarget?.kind === "template" && activeTemplate) {
			return (
				<div className="flex w-full flex-wrap items-center justify-between gap-2">
					<div className="text-muted-foreground text-xs">
						Template: {activeTemplate.name}
					</div>
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							onClick={() => setEditorTarget(null)}
							size="sm"
							type="button"
							variant="ghost"
						>
							Close
						</Button>
						<BaseSubmitButton
							isSubmitting={isMutating}
							onClick={() => void handleSaveTemplateOverride(activeTemplate)}
							size="sm"
							type="button"
						>
							Save override
						</BaseSubmitButton>
						<Button
							disabled={isMutating || !activeTemplate.skillDocumentId}
							onClick={() => void handleResetTemplate(activeTemplate)}
							size="sm"
							type="button"
							variant="outline"
						>
							Reset to default
						</Button>
					</div>
				</div>
			);
		}

		if (editorTarget?.kind === "custom" && activeCustomSkill) {
			return (
				<div className="flex w-full justify-end gap-2">
					<Button
						onClick={() => setEditorTarget(null)}
						size="sm"
						type="button"
						variant="ghost"
					>
						Close
					</Button>
					<BaseSubmitButton
						isSubmitting={isMutating}
						onClick={() =>
							void updateSkillMutation.mutateAsync({
								websiteSlug: website.slug,
								aiAgentId: aiAgent.id,
								skillDocumentId: activeCustomSkill.id,
								content:
									customSkillDrafts[activeCustomSkill.id] ??
									activeCustomSkill.content,
							})
						}
						size="sm"
						type="button"
					>
						Save skill
					</BaseSubmitButton>
				</div>
			);
		}

		if (editorTarget?.kind === "system" && activeSystemSkill) {
			return (
				<div className="flex w-full justify-end gap-2">
					<Button
						onClick={() => setEditorTarget(null)}
						size="sm"
						type="button"
						variant="ghost"
					>
						Close
					</Button>
					<BaseSubmitButton
						isSubmitting={isMutating}
						onClick={() =>
							void upsertCoreMutation.mutateAsync({
								websiteSlug: website.slug,
								aiAgentId: aiAgent.id,
								name: activeSystemSkill.name,
								content:
									systemDrafts[activeSystemSkill.name] ??
									activeSystemSkill.content,
								enabled: true,
								priority: activeSystemSkill.priority,
							})
						}
						size="sm"
						type="button"
					>
						Save system skill
					</BaseSubmitButton>
				</div>
			);
		}

		if (editorTarget?.kind === "create-custom") {
			return (
				<div className="flex w-full justify-end gap-2">
					<Button
						onClick={() => setEditorTarget(null)}
						size="sm"
						type="button"
						variant="ghost"
					>
						Close
					</Button>
					<Button
						disabled={
							isMutating ||
							!normalizeSkillFileName(newSkillName) ||
							!newSkillContent.trim()
						}
						onClick={() => void handleCreateCustomSkill()}
						size="sm"
						type="button"
					>
						Create skill
					</Button>
				</div>
			);
		}

		return null;
	})();

	return (
		<SettingsPage>
			<SettingsHeader>Skills</SettingsHeader>
			<PageContent className="py-30">
				<div className="space-y-8">
					<SettingsRow
						description="Default templates are visible to everyone but only affect runtime once enabled."
						title="Default Skill Templates"
					>
						<div className="space-y-3 p-4">
							{studio.defaultSkillTemplates.map((template) => (
								<div
									className="space-y-3 rounded-md border border-border/60 p-3"
									key={template.name}
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<p className="font-medium text-sm">{template.label}</p>
												<Badge
													className={cn(
														template.isEnabled
															? "bg-green-500/15 text-green-600"
															: "bg-muted text-muted-foreground"
													)}
													variant="secondary"
												>
													{template.isEnabled ? "Enabled" : "Template only"}
												</Badge>
												{template.hasOverride && (
													<Badge variant="outline">Override</Badge>
												)}
											</div>
											<p className="text-muted-foreground text-xs">
												{template.description}
											</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												onClick={() =>
													setEditorTarget({
														kind: "template",
														templateName: template.name,
													})
												}
												size="sm"
												type="button"
												variant="outline"
											>
												Customize
											</Button>
											<Button
												disabled={isMutating}
												onClick={() =>
													void handleEnableTemplate(
														template,
														!template.isEnabled
													)
												}
												size="sm"
												type="button"
												variant="outline"
											>
												{template.isEnabled ? "Disable" : "Enable"}
											</Button>
											<Button
												disabled={isMutating}
												onClick={() =>
													void handleDeleteTemplateForAgent(template)
												}
												size="sm"
												type="button"
												variant="outline"
											>
												Delete for agent
											</Button>
										</div>
									</div>
								</div>
							))}
						</div>
					</SettingsRow>

					<SettingsRow
						description="Create and maintain custom reusable skills for your workflows."
						title="Skill Library"
					>
						<div className="space-y-4 p-4">
							<div className="flex items-center justify-between rounded-md border border-border/70 border-dashed p-3">
								<div className="space-y-1">
									<p className="font-medium text-sm">Create custom skill</p>
									<p className="text-muted-foreground text-xs">
										Open the editor to draft a reusable skill.
									</p>
								</div>
								<Button
									onClick={() => setEditorTarget({ kind: "create-custom" })}
									size="sm"
									type="button"
								>
									Create skill
								</Button>
							</div>

							{customSkills.map((skill) => (
								<div
									className="space-y-3 rounded-md border border-border/60 p-3"
									key={skill.id}
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<p className="font-medium text-sm">{skill.name}</p>
												<Badge
													className={cn(
														skill.enabled
															? "bg-green-500/15 text-green-600"
															: "bg-muted text-muted-foreground"
													)}
													variant="secondary"
												>
													{skill.enabled ? "Enabled" : "Disabled"}
												</Badge>
											</div>
											<p className="text-muted-foreground text-xs">
												Priority {skill.priority}
											</p>
										</div>
										<div className="flex flex-wrap items-center gap-2">
											<Button
												onClick={() =>
													setEditorTarget({
														kind: "custom",
														skillId: skill.id,
													})
												}
												size="sm"
												type="button"
												variant="outline"
											>
												Edit
											</Button>
											<Switch
												checked={skill.enabled}
												disabled={isMutating}
												onCheckedChange={(checked) =>
													void toggleSkillMutation.mutateAsync({
														websiteSlug: website.slug,
														aiAgentId: aiAgent.id,
														skillDocumentId: skill.id,
														enabled: checked,
													})
												}
											/>
											<Button
												disabled={isMutating}
												onClick={() =>
													void deleteSkillMutation.mutateAsync({
														websiteSlug: website.slug,
														aiAgentId: aiAgent.id,
														skillDocumentId: skill.id,
													})
												}
												size="sm"
												type="button"
												variant="destructive"
											>
												Delete
											</Button>
										</div>
									</div>
								</div>
							))}
						</div>
					</SettingsRow>

					<SettingsRow
						description="Core prompt layers represented as named system skills."
						title="System Skills"
					>
						<div className="space-y-3 p-4">
							{studio.systemSkillDocuments.map((systemSkill) => (
								<div
									className="space-y-3 rounded-md border border-border/60 p-3"
									key={systemSkill.name}
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<p className="font-medium text-sm">
													{systemSkill.label}
												</p>
												<Badge variant="outline">{systemSkill.name}</Badge>
												<Badge variant="secondary">
													Source: {systemSkill.source}
												</Badge>
											</div>
											<p className="text-muted-foreground text-xs">
												{systemSkill.description}
											</p>
										</div>
										<Button
											onClick={() =>
												setEditorTarget({
													kind: "system",
													skillName: systemSkill.name,
												})
											}
											size="sm"
											type="button"
											variant="outline"
										>
											Edit
										</Button>
									</div>
								</div>
							))}
						</div>
						<SettingsRowFooter className="flex justify-end">
							<p className="text-muted-foreground text-xs">
								System skill changes alter the agent&apos;s base behavior.
							</p>
						</SettingsRowFooter>
					</SettingsRow>
				</div>
			</PageContent>

			<PromptEditModal
				footer={modalFooter}
				onOpenChange={(open) => {
					if (!open) {
						setEditorTarget(null);
					}
				}}
				open={editorTarget !== null}
				title={editorTitle}
			>
				{modalBody}
			</PromptEditModal>
		</SettingsPage>
	);
}
