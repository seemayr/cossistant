"use client";

import type {
	ConversationClarificationSummary,
	KnowledgeClarificationRequest,
} from "@cossistant/types";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { stepFromKnowledgeClarificationRequest } from "@/components/knowledge-clarification/helpers";
import {
	KnowledgeClarificationQuestionContent,
	useKnowledgeClarificationAnswerDraft,
} from "@/components/knowledge-clarification/question-flow";
import { useKnowledgeClarificationQueryInvalidation } from "@/components/knowledge-clarification/use-query-invalidation";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Spinner } from "../../../../../../packages/react/src/support/components/spinner";
import { ComposerBottomBlock } from "./composer-bottom-block";
import { ComposerCentralBlock } from "./composer-central-block";

type ClarificationComposerFlowProps = {
	websiteSlug: string;
	summary: ConversationClarificationSummary | null;
	request: KnowledgeClarificationRequest | null;
	onCancel: () => void;
};

type ClarificationComposerBlocks = {
	aboveBlock: React.ReactNode;
	centralBlock: React.ReactNode | null;
	bottomBlock: React.ReactNode | null;
};

type ClarificationTopicBlockProps = {
	topicSummary: string;
	stepIndex: number;
	maxSteps: number;
	className?: string;
};

type ClarificationActionsBlockProps = {
	canSubmit: boolean;
	canSkip: boolean;
	isPending: boolean;
	isSkipping: boolean;
	isSubmitting: boolean;
	onCancel: () => void;
	onSkip: () => void;
	onSubmit: () => void;
};

function ClarificationTopicBlock({
	topicSummary,
	stepIndex,
	maxSteps,
	className,
}: ClarificationTopicBlockProps) {
	return (
		<div
			className={cn(
				"mb-4 flex flex-col gap-6 rounded-[2px] px-2 py-2",
				className
			)}
			data-clarification-slot="topic"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="space-y-1">
					<div className="font-medium text-xs">Clarification questions</div>
					<p className="text-muted-foreground text-sm">{topicSummary}</p>
				</div>
				<div className="shrink-0 self-start font-medium text-muted-foreground text-xs">
					{Math.max(stepIndex, 1)} of {maxSteps}
				</div>
			</div>
		</div>
	);
}

function ClarificationLoadingBlock() {
	return (
		<ComposerCentralBlock>
			<div
				className="flex items-center gap-2 p-4 text-muted-foreground text-sm"
				data-clarification-slot="loading"
			>
				<Spinner size={16} />
				Preparing the next clarification step...
			</div>
		</ComposerCentralBlock>
	);
}

function ClarificationDraftReadyBanner({
	request,
	topicSummary,
	isApproving,
	onApprove,
	onClose,
	onView,
}: {
	request: KnowledgeClarificationRequest | null;
	topicSummary: string;
	isApproving: boolean;
	onApprove: () => void;
	onClose: () => void;
	onView: () => void;
}) {
	return (
		<div
			className="mb-4 flex items-center justify-between gap-3 rounded-[2px] border border-dashed px-3 py-2"
			data-clarification-slot="draft-ready-banner"
		>
			<div className="min-w-0">
				<div className="font-medium text-xs">FAQ draft ready</div>
				<p className="truncate text-muted-foreground text-sm">{topicSummary}</p>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				<Button
					disabled={!request}
					onClick={onView}
					size="xs"
					type="button"
					variant="ghost"
				>
					View
				</Button>
				<Button
					disabled={isApproving || !request?.draftFaqPayload}
					onClick={onApprove}
					size="xs"
					type="button"
				>
					{isApproving ? (
						<>
							<Spinner size={16} />
							Approve
						</>
					) : (
						"Approve"
					)}
				</Button>
				<Button onClick={onClose} size="xs" type="button" variant="ghost">
					Close
				</Button>
			</div>
		</div>
	);
}

function ClarificationActionsBlock({
	canSubmit,
	canSkip,
	isPending,
	isSkipping,
	isSubmitting,
	onCancel,
	onSkip,
	onSubmit,
}: ClarificationActionsBlockProps) {
	return (
		<ComposerBottomBlock className="pl-0">
			<div
				className="flex w-full items-center justify-between gap-3 py-0.4"
				data-clarification-slot="actions"
			>
				<Button
					disabled={isPending}
					onClick={onCancel}
					size="xs"
					type="button"
					variant="ghost"
				>
					Cancel
				</Button>

				<div className="flex items-center gap-2">
					<Button
						disabled={!canSkip || isPending}
						onClick={onSkip}
						size="xs"
						type="button"
						variant="ghost"
					>
						{isSkipping ? (
							<>
								<Spinner size={16} />
								Skipping
							</>
						) : (
							"Skip"
						)}
					</Button>
					<Button
						disabled={!canSubmit || isPending}
						onClick={onSubmit}
						size="xs"
						type="button"
					>
						{isSubmitting ? (
							<>
								<Spinner size={16} />
								Next
							</>
						) : (
							"Next"
						)}
					</Button>
				</div>
			</div>
		</ComposerBottomBlock>
	);
}

export function useClarificationComposerFlow({
	websiteSlug,
	summary,
	request,
	onCancel,
}: ClarificationComposerFlowProps): ClarificationComposerBlocks | null {
	const router = useRouter();
	const trpc = useTRPC();
	const invalidateClarificationQueries =
		useKnowledgeClarificationQueryInvalidation(websiteSlug);
	const [localStep, setLocalStep] = useState(
		stepFromKnowledgeClarificationRequest(request)
	);
	const [closedDraftRequestId, setClosedDraftRequestId] = useState<
		string | null
	>(null);

	useEffect(() => {
		setLocalStep(stepFromKnowledgeClarificationRequest(request));
	}, [request]);

	useEffect(() => {
		if (!(request && request.status === "draft_ready")) {
			setClosedDraftRequestId(null);
			return;
		}

		setClosedDraftRequestId((current) =>
			current === request.id ? current : null
		);
	}, [request]);

	const step = useMemo(
		() => localStep ?? stepFromKnowledgeClarificationRequest(request),
		[localStep, request]
	);

	const answerDraft = useKnowledgeClarificationAnswerDraft(
		step?.kind === "question" ? step.question : null,
		step?.kind === "question" ? step.inputMode : "suggested_answers"
	);

	const handleMutationSuccess = async (result: {
		step: NonNullable<typeof step>;
	}) => {
		setLocalStep(result.step);
		await invalidateClarificationQueries({
			request: result.step.request,
		});
	};

	const answerMutation = useMutation(
		trpc.knowledgeClarification.answer.mutationOptions({
			onSuccess: handleMutationSuccess,
			onError: (error) => {
				toast.error(error.message || "Failed to submit clarification answer");
			},
		})
	);

	const skipMutation = useMutation(
		trpc.knowledgeClarification.skip.mutationOptions({
			onSuccess: handleMutationSuccess,
			onError: (error) => {
				toast.error(error.message || "Failed to skip clarification question");
			},
		})
	);

	const approveMutation = useMutation(
		trpc.knowledgeClarification.approveDraft.mutationOptions({
			onSuccess: async (result) => {
				await invalidateClarificationQueries({
					request: result.request,
					includeKnowledgeQueries: true,
				});
				toast.success("FAQ draft approved");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to approve draft");
			},
		})
	);

	const currentRequest = step?.request ?? request;
	if (!summary) {
		return null;
	}

	const isDraftReady =
		currentRequest?.status === "draft_ready" &&
		Boolean(currentRequest.draftFaqPayload);

	if (summary.status === "draft_ready" && !currentRequest) {
		return {
			aboveBlock: (
				<ClarificationDraftReadyBanner
					isApproving={false}
					onApprove={() => {}}
					onClose={() => {
						setClosedDraftRequestId(summary.requestId);
					}}
					onView={() => {}}
					request={null}
					topicSummary={summary.topicSummary}
				/>
			),
			centralBlock: null,
			bottomBlock: null,
		};
	}

	if (
		isDraftReady &&
		currentRequest &&
		closedDraftRequestId !== currentRequest.id
	) {
		return {
			aboveBlock: (
				<ClarificationDraftReadyBanner
					isApproving={approveMutation.isPending}
					onApprove={() => {
						if (!currentRequest.draftFaqPayload) {
							return;
						}

						void approveMutation.mutateAsync({
							websiteSlug,
							requestId: currentRequest.id,
							draft: currentRequest.draftFaqPayload,
						});
					}}
					onClose={() => {
						setClosedDraftRequestId(currentRequest.id);
					}}
					onView={() => {
						router.push(
							`/${websiteSlug}/agent/training/faq/proposals/${currentRequest.id}`
						);
					}}
					request={currentRequest}
					topicSummary={currentRequest.topicSummary ?? summary.topicSummary}
				/>
			),
			centralBlock: null,
			bottomBlock: null,
		};
	}

	if (isDraftReady) {
		return null;
	}

	const topicSummary = currentRequest?.topicSummary ?? summary.topicSummary;
	const stepIndex = currentRequest?.stepIndex ?? summary.stepIndex;
	const maxSteps = currentRequest?.maxSteps ?? summary.maxSteps;
	const isSubmitting = answerMutation.isPending;
	const isSkipping = skipMutation.isPending;
	const isPending = isSubmitting || isSkipping;
	const canSkip = Boolean(step?.kind === "question");

	const handleSubmit = () => {
		if (!(step?.kind === "question" && answerDraft.submitPayload)) {
			return;
		}

		void answerMutation.mutateAsync({
			websiteSlug,
			requestId: step.request.id,
			...answerDraft.submitPayload,
		});
	};

	const handleSkip = () => {
		if (step?.kind !== "question") {
			return;
		}

		void skipMutation.mutateAsync({
			websiteSlug,
			requestId: step.request.id,
		});
	};

	return {
		aboveBlock: (
			<ClarificationTopicBlock
				maxSteps={maxSteps}
				stepIndex={stepIndex}
				topicSummary={topicSummary}
			/>
		),
		centralBlock:
			step?.kind === "question" ? (
				<ComposerCentralBlock key="question">
					<div className="p-2" data-clarification-slot="question-flow">
						<KnowledgeClarificationQuestionContent
							freeAnswer={answerDraft.freeAnswer}
							inputMode={step.inputMode}
							isAnalyzing={isPending}
							isOtherSelected={answerDraft.isOtherSelected}
							isSubmitting={isPending}
							onFreeAnswerChange={answerDraft.setFreeAnswer}
							onSelectAnswer={answerDraft.selectAnswer}
							question={step.question}
							selectedAnswer={answerDraft.selectedAnswer}
							suggestedAnswers={step.suggestedAnswers}
						/>
					</div>
				</ComposerCentralBlock>
			) : (
				<ClarificationLoadingBlock key="loading" />
			),
		bottomBlock: (
			<ClarificationActionsBlock
				canSkip={canSkip}
				canSubmit={answerDraft.canSubmit}
				isPending={isPending}
				isSkipping={isSkipping}
				isSubmitting={isSubmitting}
				onCancel={onCancel}
				onSkip={handleSkip}
				onSubmit={handleSubmit}
			/>
		),
	};
}
