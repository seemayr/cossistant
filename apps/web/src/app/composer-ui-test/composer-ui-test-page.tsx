"use client";

import { FILE_INPUT_ACCEPT } from "@cossistant/core";
import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { useState } from "react";
import {
	Composer,
	type MessageVisibility,
} from "@/components/conversation/composer";
import {
	ClarificationActionsBlock,
	ClarificationLoadingBlock,
	ClarificationQuestionBlock,
	ClarificationRetryBlock,
	ClarificationReviewActionsBlock,
	ClarificationReviewBlock,
	ClarificationTopicBlock,
} from "@/components/conversation/composer/clarification-composer-flow";
import { ClarificationPromptCard } from "@/components/conversation/composer/clarification-teaser";
import {
	buildComposerViewModel,
	type ComposerSlotBlocks,
} from "@/components/conversation/composer/composer-view-model";
import { useKnowledgeClarificationDraftReviewState } from "@/components/knowledge-clarification/draft-review";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ComposerUiPreset =
	| "default"
	| "prompt"
	| "question"
	| "streaming"
	| "review"
	| "retry"
	| "escalation"
	| "disabled";

export type ComposerUiDebugState = {
	preset: ComposerUiPreset;
	visibility: MessageVisibility;
	value: string;
	showAttachments: boolean;
	showCustomAboveBlock: boolean;
	showCustomCentralBlock: boolean;
	showCustomBottomBlock: boolean;
	showEscalationAction: boolean;
	isAiPaused: boolean;
	mentionConfigEnabled: boolean;
	autoFocus: boolean;
	disabled: boolean;
	selectedSuggestedAnswer: string | null;
	freeAnswer: string;
};

const PRESET_ORDER: ComposerUiPreset[] = [
	"default",
	"prompt",
	"question",
	"streaming",
	"review",
	"retry",
	"escalation",
	"disabled",
];

const DEBUG_FILES = [
	{
		name: "faq-notes.pdf",
		size: 248_000,
		type: "application/pdf",
	},
	{
		name: "pricing-changelog.png",
		size: 96_000,
		type: "image/png",
	},
] as File[];

const REVIEW_DRAFT = {
	title: "Billing changes and plan switches",
	question: "When does a billing or plan change take effect?",
	answer:
		"Plan changes normally take effect on the next billing cycle unless the support team explicitly confirms an immediate override.",
	categories: ["Billing", "Plans", "Support"],
	relatedQuestions: [
		"Can I change plans mid-cycle?",
		"Do billing updates prorate automatically?",
	],
};

const RETRY_REQUEST: KnowledgeClarificationRequest = {
	id: "req_debug_retry",
	organizationId: "org_debug",
	websiteId: "site_debug",
	aiAgentId: "agent_debug",
	conversationId: "conv_debug",
	source: "conversation",
	status: "retry_required",
	topicSummary: "Clarify billing change timing",
	engagementMode: "owner",
	linkedConversationCount: 1,
	stepIndex: 3,
	maxSteps: 4,
	questionPlan: null,
	targetKnowledgeId: null,
	targetKnowledgeSummary: null,
	currentQuestion: null,
	currentSuggestedAnswers: null,
	currentQuestionInputMode: null,
	currentQuestionScope: null,
	draftFaqPayload: null,
	lastError: "The model returned an incomplete answer shape for this step.",
	createdAt: "2026-04-09T08:00:00.000Z",
	updatedAt: "2026-04-09T08:03:00.000Z",
};

function createComposerUiDebugState(
	preset: ComposerUiPreset
): ComposerUiDebugState {
	switch (preset) {
		case "prompt":
			return {
				preset,
				visibility: "public",
				value: "",
				showAttachments: false,
				showCustomAboveBlock: false,
				showCustomCentralBlock: false,
				showCustomBottomBlock: false,
				showEscalationAction: false,
				isAiPaused: false,
				mentionConfigEnabled: true,
				autoFocus: false,
				disabled: false,
				selectedSuggestedAnswer: null,
				freeAnswer: "",
			};
		case "question":
			return {
				preset,
				visibility: "public",
				value: "",
				showAttachments: false,
				showCustomAboveBlock: false,
				showCustomCentralBlock: false,
				showCustomBottomBlock: false,
				showEscalationAction: false,
				isAiPaused: false,
				mentionConfigEnabled: false,
				autoFocus: false,
				disabled: false,
				selectedSuggestedAnswer: "At the next billing cycle",
				freeAnswer: "",
			};
		case "review":
			return {
				preset,
				visibility: "public",
				value: "",
				showAttachments: false,
				showCustomAboveBlock: false,
				showCustomCentralBlock: false,
				showCustomBottomBlock: false,
				showEscalationAction: false,
				isAiPaused: false,
				mentionConfigEnabled: false,
				autoFocus: false,
				disabled: false,
				selectedSuggestedAnswer: null,
				freeAnswer: "",
			};
		case "streaming":
			return {
				preset,
				visibility: "public",
				value: "",
				showAttachments: false,
				showCustomAboveBlock: false,
				showCustomCentralBlock: false,
				showCustomBottomBlock: false,
				showEscalationAction: false,
				isAiPaused: false,
				mentionConfigEnabled: false,
				autoFocus: false,
				disabled: false,
				selectedSuggestedAnswer: null,
				freeAnswer: "",
			};
		case "retry":
			return {
				preset,
				visibility: "public",
				value: "",
				showAttachments: false,
				showCustomAboveBlock: false,
				showCustomCentralBlock: false,
				showCustomBottomBlock: false,
				showEscalationAction: false,
				isAiPaused: false,
				mentionConfigEnabled: false,
				autoFocus: false,
				disabled: false,
				selectedSuggestedAnswer: null,
				freeAnswer: "",
			};
		case "escalation":
			return {
				preset,
				visibility: "public",
				value: "",
				showAttachments: false,
				showCustomAboveBlock: false,
				showCustomCentralBlock: false,
				showCustomBottomBlock: false,
				showEscalationAction: true,
				isAiPaused: false,
				mentionConfigEnabled: false,
				autoFocus: false,
				disabled: false,
				selectedSuggestedAnswer: null,
				freeAnswer: "",
			};
		case "disabled":
			return {
				preset,
				visibility: "private",
				value: "Waiting on a teammate before I send this note.",
				showAttachments: false,
				showCustomAboveBlock: false,
				showCustomCentralBlock: false,
				showCustomBottomBlock: false,
				showEscalationAction: false,
				isAiPaused: true,
				mentionConfigEnabled: true,
				autoFocus: false,
				disabled: true,
				selectedSuggestedAnswer: null,
				freeAnswer: "",
			};
		default:
			return {
				preset: "default",
				visibility: "public",
				value: "I checked your workspace and I can help with that.",
				showAttachments: false,
				showCustomAboveBlock: false,
				showCustomCentralBlock: false,
				showCustomBottomBlock: false,
				showEscalationAction: false,
				isAiPaused: false,
				mentionConfigEnabled: true,
				autoFocus: false,
				disabled: false,
				selectedSuggestedAnswer: null,
				freeAnswer: "",
			};
	}
}

function ToggleRow({
	id,
	label,
	description,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	description: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="space-y-1">
				<Label htmlFor={id}>{label}</Label>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<Switch
				aria-label={label}
				checked={checked}
				id={id}
				onCheckedChange={onChange}
			/>
		</div>
	);
}

function createCustomSlots(
	state: ComposerUiDebugState
): ComposerSlotBlocks | null {
	const slots: ComposerSlotBlocks = {};

	if (state.showCustomAboveBlock) {
		slots.aboveBlock = (
			<div
				className="mb-3 rounded border border-dashed bg-muted/30 px-4 py-3 text-sm"
				data-composer-ui-custom-slot="above"
			>
				Custom above block
			</div>
		);
	}

	if (state.showCustomCentralBlock) {
		slots.centralBlock = (
			<div
				className="rounded border border-dashed bg-muted/30 p-4 text-sm"
				data-composer-ui-custom-slot="central"
			>
				Custom central block
			</div>
		);
	}

	if (state.showCustomBottomBlock) {
		slots.bottomBlock = (
			<div
				className="rounded border border-dashed bg-muted/30 px-3 py-2 text-sm"
				data-composer-ui-custom-slot="bottom"
			>
				Custom bottom block
			</div>
		);
	}

	return slots.aboveBlock || slots.centralBlock || slots.bottomBlock
		? slots
		: null;
}

function ComposerPreview({
	debugState,
	onAction,
	onFreeAnswerChange,
	onPresetChange,
	onSelectedSuggestedAnswerChange,
	onValueChange,
	onVisibilityChange,
}: {
	debugState: ComposerUiDebugState;
	onAction: (label: string) => void;
	onFreeAnswerChange: (value: string) => void;
	onPresetChange: (preset: ComposerUiPreset) => void;
	onSelectedSuggestedAnswerChange: (value: string) => void;
	onValueChange: (value: string) => void;
	onVisibilityChange: (visibility: MessageVisibility) => void;
}) {
	const reviewState = useKnowledgeClarificationDraftReviewState(REVIEW_DRAFT);
	const clarificationPrompt =
		debugState.preset === "prompt" ? (
			<ClarificationPromptCard
				onClarify={() => {
					onAction("Clarification started");
					onPresetChange("question");
				}}
				onDismiss={() => onAction("Clarification dismissed")}
				onLater={() => onAction("Clarification saved for later")}
				topicSummary="Clarify how billing changes take effect so the FAQ answer is consistent."
			/>
		) : null;

	let clarificationFlow: ComposerSlotBlocks | null = null;

	if (debugState.preset === "question") {
		clarificationFlow = {
			aboveBlock: (
				<ClarificationTopicBlock
					stepIndex={2}
					topicSummary="Clarify how billing changes take effect so the FAQ answer is consistent."
				/>
			),
			centralBlock: (
				<ClarificationQuestionBlock
					autoFocus={false}
					freeAnswer={debugState.freeAnswer}
					inputMode="suggested_answers"
					isOtherSelected={debugState.selectedSuggestedAnswer === "Other"}
					isPending={false}
					onFreeAnswerChange={onFreeAnswerChange}
					onSelectAnswer={onSelectedSuggestedAnswerChange}
					question="When should customers expect a billing or plan change to take effect?"
					selectedAnswer={debugState.selectedSuggestedAnswer}
					suggestedAnswers={[
						"Immediately",
						"At the next billing cycle",
						"Other",
					]}
				/>
			),
			bottomBlock: (
				<ClarificationActionsBlock
					canSkip={true}
					canSubmit={Boolean(
						debugState.selectedSuggestedAnswer || debugState.freeAnswer.trim()
					)}
					isPending={false}
					isSkipping={false}
					isSubmitting={false}
					onCancel={() => onAction("Clarification canceled")}
					onSkip={() => onAction("Clarification question skipped")}
					onSubmit={() => onAction("Clarification answer submitted")}
				/>
			),
		};
	} else if (debugState.preset === "streaming") {
		clarificationFlow = {
			aboveBlock: (
				<ClarificationTopicBlock
					stepIndex={2}
					topicSummary="Clarify how billing changes take effect so the FAQ answer is consistent."
				/>
			),
			centralBlock: (
				<ClarificationLoadingBlock
					label="Reviewing what we already know..."
					submittedAnswer="At the next billing cycle"
				/>
			),
			bottomBlock: null,
		};
	} else if (debugState.preset === "review") {
		clarificationFlow = {
			aboveBlock: (
				<ClarificationTopicBlock
					stepIndex={4}
					topicSummary="Clarify how billing changes take effect so the FAQ answer is consistent."
				/>
			),
			centralBlock: (
				<ClarificationReviewBlock
					isSubmittingApproval={false}
					state={reviewState}
				/>
			),
			bottomBlock: (
				<ClarificationReviewActionsBlock
					canApprove={reviewState.canApprove}
					isApproving={false}
					onApprove={() => {
						onAction(`Review approved: ${reviewState.parsedDraft.question}`);
						onPresetChange("default");
					}}
					onSkip={() => {
						onAction("Review skipped");
						onPresetChange("default");
					}}
				/>
			),
		};
	} else if (debugState.preset === "retry") {
		clarificationFlow = {
			aboveBlock: (
				<ClarificationTopicBlock
					stepIndex={3}
					topicSummary="Clarify how billing changes take effect so the FAQ answer is consistent."
				/>
			),
			centralBlock: (
				<ClarificationRetryBlock
					isRetrying={false}
					onCancel={() => onAction("Retry flow canceled")}
					onRetry={() => onAction("Retry requested")}
					request={RETRY_REQUEST}
				/>
			),
		};
	}

	const composerViewModel = buildComposerViewModel({
		input: {
			allowedFileTypes: FILE_INPUT_ACCEPT,
			autoFocus: debugState.autoFocus,
			disabled: debugState.disabled,
			files: debugState.showAttachments ? DEBUG_FILES : [],
			isAiPauseActionPending: false,
			isSubmitting: false,
			isUploading: false,
			layoutMode: "inline",
			maxFileSize: 10 * 1024 * 1024,
			maxFiles: 2,
			mentionConfig: debugState.mentionConfigEnabled
				? {
						aiAgent: {
							id: "agent_debug",
							isActive: true,
							name: "Coss",
						},
						teamMembers: [
							{
								email: "anthony@cossistant.com",
								id: "member_1",
								image: null,
								name: "Anthony",
							},
							{
								email: "marina@cossistant.com",
								id: "member_2",
								image: null,
								name: "Marina",
							},
						],
						tools: [
							{
								description: "Check recent FAQ edits",
								id: "faq-search",
								name: "faq-search",
							},
						],
						visitor: {
							contact: {
								email: "olivia@patchbay.fm",
								name: "Olivia Parker",
							},
							id: "visitor_debug",
						},
					}
				: undefined,
			onAiPauseAction: (action) => onAction(`AI pause action: ${action}`),
			onChange: onValueChange,
			onFileSelect: () => onAction("Attach button pressed"),
			onMarkdownChange: () => {},
			onRemoveFile: (index) => onAction(`Removed file ${index + 1}`),
			onSubmit: () => onAction("Composer submitted"),
			onVisibilityChange: (visibility) => {
				onVisibilityChange(visibility);
				onAction(`Visibility switched to ${visibility}`);
			},
			placeholder: "Type your message...",
			uploadProgress: 0,
			value: debugState.value,
			visibility: debugState.visibility,
			aiPausedUntil: debugState.isAiPaused ? "2120-01-01T00:00:00.000Z" : null,
		},
		slots: createCustomSlots(debugState),
		clarification: {
			promptBlock: clarificationPrompt,
			flowBlocks: clarificationFlow,
		},
		escalationAction: debugState.showEscalationAction
			? {
					isJoining: false,
					onJoin: () => onAction("Joined escalation"),
					reason: "A teammate requested human follow-up before answering.",
				}
			: null,
	});

	return (
		<div
			className="flex min-h-[400px] w-full items-start justify-center"
			data-composer-ui-preview="true"
		>
			<div
				className="flex max-h-[calc(100vh-3rem)] min-h-[400px] w-full items-center justify-center overflow-y-auto px-4 py-10"
				data-composer-ui-center-scroll="true"
			>
				<div className="w-full max-w-2xl">
					<Composer {...composerViewModel.input} />
				</div>
			</div>
		</div>
	);
}

export function ComposerUiTestPage() {
	const [debugState, setDebugState] = useState<ComposerUiDebugState>(() =>
		createComposerUiDebugState("default")
	);
	const [lastAction, setLastAction] = useState<string | null>(null);

	const updateState = (patch: Partial<ComposerUiDebugState>) => {
		setDebugState((current) => ({ ...current, ...patch }));
	};

	const handlePresetChange = (preset: ComposerUiPreset) => {
		setLastAction(`Preset changed to ${preset}`);
		setDebugState(createComposerUiDebugState(preset));
	};

	return (
		<div
			className="min-h-screen bg-background p-6 dark:bg-background-100"
			data-composer-ui-test="true"
		>
			<div className="mx-auto grid max-w-[1600px] gap-6 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
				<div className="space-y-4" data-composer-ui-controls="true">
					<Card>
						<CardHeader>
							<CardTitle>Composer UI Test</CardTitle>
							<CardDescription>
								Switch local states and inspect the real composer.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-2">
							{PRESET_ORDER.map((preset) => (
								<Button
									className={cn(
										"justify-start",
										debugState.preset === preset && "pointer-events-none"
									)}
									data-composer-ui-preset={preset}
									key={preset}
									onClick={() => handlePresetChange(preset)}
									size="xs"
									type="button"
									variant={
										debugState.preset === preset ? "secondary" : "outline"
									}
								>
									{preset}
								</Button>
							))}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Controls</CardTitle>
							<CardDescription>
								Edit core composer props without leaving the page.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label>Visibility</Label>
								<div className="flex gap-2">
									<Button
										aria-pressed={debugState.visibility === "public"}
										data-composer-ui-visibility="public"
										onClick={() => updateState({ visibility: "public" })}
										size="xs"
										type="button"
										variant={
											debugState.visibility === "public"
												? "secondary"
												: "outline"
										}
									>
										Public
									</Button>
									<Button
										aria-pressed={debugState.visibility === "private"}
										data-composer-ui-visibility="private"
										onClick={() => updateState({ visibility: "private" })}
										size="xs"
										type="button"
										variant={
											debugState.visibility === "private"
												? "secondary"
												: "outline"
										}
									>
										Private
									</Button>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="composer-ui-text-value">Textarea value</Label>
								<Textarea
									id="composer-ui-text-value"
									onChange={(event) =>
										updateState({ value: event.target.value })
									}
									rows={5}
									value={debugState.value}
								/>
							</div>
						</CardContent>
					</Card>

					<p
						className="px-1 text-muted-foreground text-xs"
						data-composer-ui-last-action={lastAction ?? "none"}
					>
						Last action: {lastAction ?? "none"}
					</p>
				</div>

				<ComposerPreview
					debugState={debugState}
					onAction={setLastAction}
					onFreeAnswerChange={(value) => updateState({ freeAnswer: value })}
					onPresetChange={handlePresetChange}
					onSelectedSuggestedAnswerChange={(value) =>
						updateState({
							selectedSuggestedAnswer: value,
							freeAnswer: value === "Other" ? debugState.freeAnswer : "",
						})
					}
					onValueChange={(value) => updateState({ value })}
					onVisibilityChange={(visibility) => updateState({ visibility })}
				/>

				<div className="space-y-4" data-composer-ui-advanced="true">
					<Card>
						<CardHeader>
							<CardTitle>Advanced</CardTitle>
							<CardDescription>
								Toggle optional blocks and secondary states.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<ToggleRow
								checked={debugState.showAttachments}
								description="Show fake attachment chips."
								id="composer-ui-attachments"
								label="Attachments"
								onChange={(checked) =>
									updateState({ showAttachments: checked })
								}
							/>
							<ToggleRow
								checked={debugState.showCustomAboveBlock}
								description="Inject a custom above slot."
								id="composer-ui-custom-above"
								label="Custom above block"
								onChange={(checked) =>
									updateState({ showCustomAboveBlock: checked })
								}
							/>
							<ToggleRow
								checked={debugState.showCustomCentralBlock}
								description="Replace the default center area."
								id="composer-ui-custom-central"
								label="Custom central block"
								onChange={(checked) =>
									updateState({ showCustomCentralBlock: checked })
								}
							/>
							<ToggleRow
								checked={debugState.showCustomBottomBlock}
								description="Swap the footer area."
								id="composer-ui-custom-bottom"
								label="Custom bottom block"
								onChange={(checked) =>
									updateState({ showCustomBottomBlock: checked })
								}
							/>
							<ToggleRow
								checked={debugState.showEscalationAction}
								description="Show the escalation join state."
								id="composer-ui-escalation"
								label="Escalation"
								onChange={(checked) =>
									updateState({ showEscalationAction: checked })
								}
							/>
							<ToggleRow
								checked={debugState.isAiPaused}
								description="Enable the AI pause footer state."
								id="composer-ui-ai-paused"
								label="AI paused"
								onChange={(checked) => updateState({ isAiPaused: checked })}
							/>
							<ToggleRow
								checked={debugState.mentionConfigEnabled}
								description="Enable fake mentions."
								id="composer-ui-mentions"
								label="Mentions"
								onChange={(checked) =>
									updateState({ mentionConfigEnabled: checked })
								}
							/>
							<ToggleRow
								checked={debugState.autoFocus}
								description="Allow autofocus in the textarea."
								id="composer-ui-autofocus"
								label="Autofocus"
								onChange={(checked) => updateState({ autoFocus: checked })}
							/>
							<ToggleRow
								checked={debugState.disabled}
								description="Disable the composer."
								id="composer-ui-disabled"
								label="Disabled"
								onChange={(checked) => updateState({ disabled: checked })}
							/>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
