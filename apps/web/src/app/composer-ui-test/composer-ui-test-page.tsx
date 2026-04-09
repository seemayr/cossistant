"use client";

import { FILE_INPUT_ACCEPT } from "@cossistant/core";
import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { type ReactNode, useState } from "react";
import {
	Composer,
	type MessageVisibility,
} from "@/components/conversation/composer";
import {
	ClarificationActionsBlock,
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
import Icon from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ComposerUiPreset =
	| "default"
	| "prompt"
	| "question"
	| "review"
	| "retry"
	| "escalation"
	| "disabled"
	| "uploading";

export type ComposerShellMode = "fake-inbox";

export type ComposerUiDebugState = {
	preset: ComposerUiPreset;
	shellMode: ComposerShellMode;
	visibility: MessageVisibility;
	value: string;
	showAttachments: boolean;
	isUploading: boolean;
	uploadProgress: number;
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
	"review",
	"retry",
	"escalation",
	"disabled",
	"uploading",
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
				shellMode: "fake-inbox",
				visibility: "public",
				value: "",
				showAttachments: false,
				isUploading: false,
				uploadProgress: 40,
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
				shellMode: "fake-inbox",
				visibility: "public",
				value: "",
				showAttachments: false,
				isUploading: false,
				uploadProgress: 40,
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
				shellMode: "fake-inbox",
				visibility: "public",
				value: "",
				showAttachments: false,
				isUploading: false,
				uploadProgress: 40,
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
				shellMode: "fake-inbox",
				visibility: "public",
				value: "",
				showAttachments: false,
				isUploading: false,
				uploadProgress: 40,
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
				shellMode: "fake-inbox",
				visibility: "public",
				value: "",
				showAttachments: false,
				isUploading: false,
				uploadProgress: 40,
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
				shellMode: "fake-inbox",
				visibility: "private",
				value: "Waiting on a teammate before I send this note.",
				showAttachments: false,
				isUploading: false,
				uploadProgress: 40,
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
		case "uploading":
			return {
				preset,
				shellMode: "fake-inbox",
				visibility: "public",
				value: "Sharing the updated screenshots now.",
				showAttachments: true,
				isUploading: true,
				uploadProgress: 62,
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
		default:
			return {
				preset: "default",
				shellMode: "fake-inbox",
				visibility: "public",
				value: "I checked your workspace and I can help with that.",
				showAttachments: false,
				isUploading: false,
				uploadProgress: 40,
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

type ControlSectionProps = {
	title: string;
	description: string;
	children: ReactNode;
};

function ControlSection({ title, description, children }: ControlSectionProps) {
	return (
		<section className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm backdrop-blur">
			<div className="mb-3 space-y-1">
				<h2 className="font-medium text-sm uppercase tracking-[0.08em]">
					{title}
				</h2>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<div className="space-y-3">{children}</div>
		</section>
	);
}

function ToggleRow({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-start gap-3 rounded-xl border border-black/8 bg-background/80 px-3 py-3 text-sm">
			<input
				aria-label={label}
				checked={checked}
				className="mt-1 h-4 w-4 accent-primary"
				onChange={(event) => onChange(event.target.checked)}
				type="checkbox"
			/>
			<span className="space-y-0.5">
				<span className="block font-medium text-foreground">{label}</span>
				<span className="block text-muted-foreground">{description}</span>
			</span>
		</label>
	);
}

function ComposerPresetButton({
	isActive,
	label,
	onClick,
}: {
	isActive: boolean;
	label: ComposerUiPreset;
	onClick: () => void;
}) {
	return (
		<Button
			className={cn(
				"justify-start rounded-xl border border-black/10 bg-white/80 text-left text-xs uppercase tracking-[0.08em] hover:bg-white",
				isActive && "border-primary/40 bg-primary/10 text-primary"
			)}
			data-composer-ui-preset={label}
			onClick={onClick}
			size="xs"
			type="button"
			variant={isActive ? "secondary" : "ghost"}
		>
			{label}
		</Button>
	);
}

function FakeTimelineBubble({
	align = "left",
	eyebrow,
	text,
}: {
	align?: "left" | "right";
	eyebrow: string;
	text: string;
}) {
	return (
		<div
			className={cn(
				"flex",
				align === "right" ? "justify-end" : "justify-start"
			)}
		>
			<div
				className={cn(
					"max-w-[78%] rounded-2xl border px-4 py-3 shadow-sm",
					align === "right"
						? "border-primary/10 bg-primary text-primary-foreground"
						: "border-black/10 bg-white/95"
				)}
			>
				<div
					className={cn(
						"mb-1 font-medium text-[11px] uppercase tracking-[0.12em]",
						align === "right"
							? "text-primary-foreground/70"
							: "text-muted-foreground"
					)}
				>
					{eyebrow}
				</div>
				<p className="text-sm leading-6">{text}</p>
			</div>
		</div>
	);
}

function createCustomSlots(
	state: ComposerUiDebugState,
	lastAction: string | null
): ComposerSlotBlocks | null {
	const slots: ComposerSlotBlocks = {};

	if (state.showCustomAboveBlock) {
		slots.aboveBlock = (
			<div
				className="mb-3 rounded-2xl border border-sky-500/40 border-dashed bg-sky-500/8 px-4 py-3 text-sm"
				data-composer-ui-custom-slot="above"
			>
				<div className="font-medium text-sky-900 dark:text-sky-100">
					Custom above block
				</div>
				<p className="mt-1 text-sky-900/70 dark:text-sky-100/80">
					Use this to inspect banners, notices, or ephemeral workflow hints.
				</p>
			</div>
		);
	}

	if (state.showCustomCentralBlock) {
		slots.centralBlock = (
			<div
				className="rounded-3xl border border-emerald-500/30 bg-emerald-500/8 p-5"
				data-composer-ui-custom-slot="central"
			>
				<div className="flex items-center gap-2 font-medium text-emerald-900 text-sm dark:text-emerald-100">
					<Icon className="size-4" name="star" />
					Custom central block
				</div>
				<p className="mt-2 text-emerald-900/70 text-sm leading-6 dark:text-emerald-100/80">
					This is helpful when you want to isolate a bespoke state without the
					default editor chrome underneath it.
				</p>
				{lastAction ? (
					<div className="mt-3 rounded-xl border border-emerald-500/20 bg-white/70 px-3 py-2 text-emerald-900 text-xs dark:bg-black/10 dark:text-emerald-50">
						Last action: {lastAction}
					</div>
				) : null}
			</div>
		);
	}

	if (state.showCustomBottomBlock) {
		slots.bottomBlock = (
			<div
				className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/8 px-3 py-2"
				data-composer-ui-custom-slot="bottom"
			>
				<span className="font-medium text-amber-900 text-xs uppercase tracking-[0.08em] dark:text-amber-100">
					Custom footer
				</span>
				<Button size="xs" type="button" variant="ghost">
					Debug action
				</Button>
			</div>
		);
	}

	return slots.aboveBlock || slots.centralBlock || slots.bottomBlock
		? slots
		: null;
}

function ComposerPreviewSurface({
	debugState,
	lastAction,
	onAction,
	onFreeAnswerChange,
	onPresetChange,
	onSelectedSuggestedAnswerChange,
	onValueChange,
	onVisibilityChange,
}: {
	debugState: ComposerUiDebugState;
	lastAction: string | null;
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
			isUploading: debugState.isUploading,
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
			renderAttachButton: ({ disabled, triggerFileInput }) => (
				<Button
					className="h-8 w-8 rounded-full"
					disabled={disabled}
					onClick={triggerFileInput}
					size="icon"
					type="button"
					variant="ghost"
				>
					<Icon className="h-4 w-4" name="attachment" />
				</Button>
			),
			uploadProgress: debugState.uploadProgress,
			value: debugState.value,
			visibility: debugState.visibility,
			aiPausedUntil: debugState.isAiPaused ? "2120-01-01T00:00:00.000Z" : null,
		},
		slots: createCustomSlots(debugState, lastAction),
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
			className="rounded-[28px] border border-black/10 bg-white/80 p-4 shadow-2xl shadow-black/8 backdrop-blur"
			data-composer-ui-shell="true"
		>
			<div className="flex flex-wrap items-center justify-between gap-3 border-black/8 border-b pb-4">
				<div>
					<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
						Composer UI Test
					</div>
					<h1 className="mt-1 font-medium text-xl">
						Focused inbox shell for composer iteration
					</h1>
				</div>
				<div className="rounded-full border border-black/10 bg-background/80 px-3 py-1 font-medium text-xs uppercase tracking-[0.1em]">
					{debugState.preset}
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
				<div className="min-w-0">
					<div
						className="mt-4 rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,245,0.92))] p-4"
						data-composer-ui-timeline="true"
					>
						<div className="mb-4 flex items-center justify-between gap-3">
							<div>
								<div className="font-medium text-sm">Olivia Parker</div>
								<p className="text-muted-foreground text-sm">
									Acme billing workflow conversation
								</p>
							</div>
							<div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-900 text-xs dark:text-emerald-100">
								Live preview
							</div>
						</div>

						<div className="space-y-3 pb-6">
							<FakeTimelineBubble
								eyebrow="Visitor"
								text="If I change plans today, when should the billing update actually take effect?"
							/>
							<FakeTimelineBubble
								align="right"
								eyebrow="AI assistant"
								text="I can answer that, but I want to confirm the exact billing policy before I update the FAQ."
							/>
							<FakeTimelineBubble
								eyebrow="Internal note"
								text="This shell is fake on purpose so the composer can be tested in isolation."
							/>
						</div>
					</div>

					<div className="mt-4 rounded-[28px] border border-black/8 bg-background/90 px-4 py-4">
						<div className="mx-auto w-full max-w-2xl">
							<Composer {...composerViewModel.input} />
						</div>
					</div>
				</div>

				<div className="mt-4 space-y-3 rounded-[24px] border border-black/8 bg-background/80 p-4">
					<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
						Preview notes
					</div>
					<div className="space-y-2 text-sm leading-6">
						<p>
							The shell stays fake and local. Only the composer and its slot
							states are real.
						</p>
						<p>
							Clarification presets override custom slots in the same way the
							live inbox does.
						</p>
					</div>
					<div
						className="rounded-2xl border border-black/10 border-dashed bg-muted/40 px-3 py-3 text-sm"
						data-composer-ui-last-action={lastAction ?? "none"}
					>
						<div className="font-medium text-xs uppercase tracking-[0.08em]">
							Last action
						</div>
						<p className="mt-1 text-muted-foreground">
							{lastAction ?? "No interaction yet."}
						</p>
					</div>
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
			className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef2eb_52%,#e8ece7_100%)] px-4 py-6 text-foreground lg:px-6"
			data-composer-ui-test="true"
		>
			<div className="mx-auto grid max-w-[1480px] gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
				<div className="space-y-4">
					<ControlSection
						description="Jump between the main states without loading the real inbox."
						title="Presets"
					>
						<div className="grid grid-cols-2 gap-2">
							{PRESET_ORDER.map((preset) => (
								<ComposerPresetButton
									isActive={debugState.preset === preset}
									key={preset}
									label={preset}
									onClick={() => handlePresetChange(preset)}
								/>
							))}
						</div>
					</ControlSection>

					<ControlSection
						description="Adjust the generic props the composer receives."
						title="Controls"
					>
						<div className="space-y-2">
							<label className="space-y-2 text-sm">
								<span className="block font-medium">Visibility</span>
								<select
									aria-label="Composer visibility"
									className="flex h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm"
									onChange={(event) =>
										updateState({
											visibility: event.target.value as MessageVisibility,
										})
									}
									value={debugState.visibility}
								>
									<option value="public">Public reply</option>
									<option value="private">Private note</option>
								</select>
							</label>
						</div>

						<label
							className="space-y-2 text-sm"
							htmlFor="composer-textarea-value"
						>
							<span className="block font-medium">Textarea value</span>
							<Textarea
								id="composer-textarea-value"
								onChange={(event) => updateState({ value: event.target.value })}
								rows={5}
								value={debugState.value}
							/>
						</label>

						<label className="space-y-2 text-sm">
							<span className="block font-medium">Upload progress</span>
							<div className="flex items-center gap-3">
								<input
									aria-label="Upload progress"
									className="w-full accent-primary"
									max={100}
									min={0}
									onChange={(event) =>
										updateState({
											uploadProgress: Number(event.target.value),
										})
									}
									type="range"
									value={debugState.uploadProgress}
								/>
								<Input
									className="w-20"
									inputMode="numeric"
									onChange={(event) =>
										updateState({
											uploadProgress: Number(event.target.value) || 0,
										})
									}
									value={String(debugState.uploadProgress)}
								/>
							</div>
						</label>
					</ControlSection>

					<ControlSection
						description="Flip high-value layout and chrome options on top of the preset."
						title="Advanced"
					>
						<ToggleRow
							checked={debugState.showAttachments}
							description="Show fake attachments in the default editor surface."
							label="Attachments"
							onChange={(checked) => updateState({ showAttachments: checked })}
						/>
						<ToggleRow
							checked={debugState.isUploading}
							description="Display the upload progress meter above attachment chips."
							label="Uploading"
							onChange={(checked) => updateState({ isUploading: checked })}
						/>
						<ToggleRow
							checked={debugState.showCustomAboveBlock}
							description="Inject a custom above block when clarification UI is inactive."
							label="Custom above block"
							onChange={(checked) =>
								updateState({ showCustomAboveBlock: checked })
							}
						/>
						<ToggleRow
							checked={debugState.showCustomCentralBlock}
							description="Replace the editor with a custom central block."
							label="Custom central block"
							onChange={(checked) =>
								updateState({ showCustomCentralBlock: checked })
							}
						/>
						<ToggleRow
							checked={debugState.showCustomBottomBlock}
							description="Swap the footer for a custom bottom block."
							label="Custom bottom block"
							onChange={(checked) =>
								updateState({ showCustomBottomBlock: checked })
							}
						/>
						<ToggleRow
							checked={debugState.showEscalationAction}
							description="Show the escalation join state in the composer."
							label="Escalation"
							onChange={(checked) =>
								updateState({ showEscalationAction: checked })
							}
						/>
						<ToggleRow
							checked={debugState.isAiPaused}
							description="Enable the AI pause footer state."
							label="AI paused"
							onChange={(checked) => updateState({ isAiPaused: checked })}
						/>
						<ToggleRow
							checked={debugState.mentionConfigEnabled}
							description="Add fake AI, teammate, visitor, and tool mentions."
							label="Mentions"
							onChange={(checked) =>
								updateState({ mentionConfigEnabled: checked })
							}
						/>
						<ToggleRow
							checked={debugState.autoFocus}
							description="Allow the real textarea to grab focus on mount."
							label="Autofocus"
							onChange={(checked) => updateState({ autoFocus: checked })}
						/>
						<ToggleRow
							checked={debugState.disabled}
							description="Disable the editor and built-in actions."
							label="Disabled"
							onChange={(checked) => updateState({ disabled: checked })}
						/>
					</ControlSection>
				</div>

				<ComposerPreviewSurface
					debugState={debugState}
					lastAction={lastAction}
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
			</div>
		</div>
	);
}
