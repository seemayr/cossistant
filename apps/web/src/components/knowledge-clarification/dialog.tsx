"use client";

import type {
	ApproveKnowledgeClarificationDraftResponse,
	KnowledgeClarificationRequest,
	KnowledgeClarificationStepResponse,
} from "@cossistant/types";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useTRPC } from "@/lib/trpc/client";
import { KnowledgeClarificationDraftReview } from "./draft-review";
import { stepFromKnowledgeClarificationRequest } from "./helpers";
import { KnowledgeClarificationQuestionCard } from "./question-card";
import { useKnowledgeClarificationQueryInvalidation } from "./use-query-invalidation";

type KnowledgeClarificationDialogProps = {
	websiteSlug: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialStep: KnowledgeClarificationStepResponse | null;
	initialRequest?: KnowledgeClarificationRequest | null;
	onApproved?: (
		result: ApproveKnowledgeClarificationDraftResponse
	) => void | Promise<void>;
};

export function KnowledgeClarificationDialog({
	websiteSlug,
	open,
	onOpenChange,
	initialStep,
	initialRequest,
	onApproved,
}: KnowledgeClarificationDialogProps) {
	const trpc = useTRPC();
	const invalidateQueries =
		useKnowledgeClarificationQueryInvalidation(websiteSlug);
	const [step, setStep] = useState<KnowledgeClarificationStepResponse | null>(
		initialStep
	);
	const [requestFallback, setRequestFallback] =
		useState<KnowledgeClarificationRequest | null>(
			initialRequest ?? initialStep?.request ?? null
		);

	useEffect(() => {
		setStep(initialStep);
		setRequestFallback(initialRequest ?? initialStep?.request ?? null);
	}, [initialRequest, initialStep]);

	const answerMutation = useMutation(
		trpc.knowledgeClarification.answer.mutationOptions({
			onSuccess: async (result) => {
				setStep(result.step);
				setRequestFallback(result.step.request);
				await invalidateQueries({
					request: result.step.request,
				});
			},
			onError: (error) => {
				toast.error(error.message || "Failed to submit clarification answer");
			},
		})
	);

	const deferMutation = useMutation(
		trpc.knowledgeClarification.defer.mutationOptions({
			onSuccess: async (request) => {
				await invalidateQueries({ request });
				onOpenChange(false);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save clarification for later");
			},
		})
	);

	const dismissMutation = useMutation(
		trpc.knowledgeClarification.dismiss.mutationOptions({
			onSuccess: async (request) => {
				await invalidateQueries({ request });
				onOpenChange(false);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to remove clarification");
			},
		})
	);

	const retryMutation = useMutation(
		trpc.knowledgeClarification.retry.mutationOptions({
			onSuccess: async (result) => {
				setStep(result.step);
				setRequestFallback(result.step.request);
				await invalidateQueries({
					request: result.step.request,
				});
			},
			onError: (error) => {
				toast.error(error.message || "Failed to retry clarification");
			},
		})
	);

	const approveMutation = useMutation(
		trpc.knowledgeClarification.approveDraft.mutationOptions({
			onSuccess: async (result) => {
				await invalidateQueries({
					request: result.request,
					includeKnowledgeQueries: true,
				});
				await onApproved?.(result);
				toast.success("FAQ draft approved");
				onOpenChange(false);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to approve draft");
			},
		})
	);

	const currentStep = step;
	const currentRequest = currentStep?.request ?? requestFallback;
	const fallbackStep = currentRequest
		? stepFromKnowledgeClarificationRequest(currentRequest)
		: null;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-2xl" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Knowledge clarification</DialogTitle>
					<DialogDescription>
						Guide the AI toward a better FAQ draft without escalating the
						conversation.
					</DialogDescription>
				</DialogHeader>

				{currentStep?.kind === "question" ? (
					<KnowledgeClarificationQuestionCard
						description="Answer the current question now, save it for later, or remove it entirely."
						isAnalyzing={answerMutation.isPending}
						isSubmitting={answerMutation.isPending}
						maxSteps={currentStep.request.maxSteps}
						onDefer={() => {
							void deferMutation.mutateAsync({
								websiteSlug,
								requestId: currentStep.request.id,
							});
						}}
						onDismiss={() => {
							void dismissMutation.mutateAsync({
								websiteSlug,
								requestId: currentStep.request.id,
							});
						}}
						onSubmit={(payload) => {
							void answerMutation.mutateAsync({
								websiteSlug,
								requestId: currentStep.request.id,
								...payload,
							});
						}}
						question={currentStep.question}
						stepIndex={currentStep.request.stepIndex}
						suggestedAnswers={currentStep.suggestedAnswers}
					/>
				) : currentStep?.kind === "draft_ready" ? (
					<KnowledgeClarificationDraftReview
						draft={currentStep.draftFaqPayload}
						isSubmitting={approveMutation.isPending}
						onApprove={(draft) => {
							void approveMutation.mutateAsync({
								websiteSlug,
								requestId: currentStep.request.id,
								draft,
							});
						}}
						onDismiss={() => {
							onOpenChange(false);
						}}
					/>
				) : fallbackStep?.kind === "question" ? (
					<KnowledgeClarificationQuestionCard
						description="This proposal is waiting for another answer."
						isSubmitting={answerMutation.isPending}
						maxSteps={fallbackStep.request.maxSteps}
						onDefer={() => {
							void deferMutation.mutateAsync({
								websiteSlug,
								requestId: fallbackStep.request.id,
							});
						}}
						onDismiss={() => {
							void dismissMutation.mutateAsync({
								websiteSlug,
								requestId: fallbackStep.request.id,
							});
						}}
						onSubmit={(payload) => {
							void answerMutation.mutateAsync({
								websiteSlug,
								requestId: fallbackStep.request.id,
								...payload,
							});
						}}
						question={fallbackStep.question}
						stepIndex={fallbackStep.request.stepIndex}
						suggestedAnswers={fallbackStep.suggestedAnswers}
					/>
				) : fallbackStep?.kind === "draft_ready" ? (
					<KnowledgeClarificationDraftReview
						draft={fallbackStep.draftFaqPayload}
						isSubmitting={approveMutation.isPending}
						onApprove={(draft) => {
							void approveMutation.mutateAsync({
								websiteSlug,
								requestId: fallbackStep.request.id,
								draft,
							});
						}}
						onDismiss={() => {
							onOpenChange(false);
						}}
					/>
				) : currentRequest ? (
					<div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-10 text-center">
						<LoaderCircleIcon
							className={`h-6 w-6 ${
								retryMutation.isPending ? "animate-spin" : ""
							}`}
						/>
						<div className="space-y-1">
							<div className="font-medium">
								This clarification needs a retry
							</div>
							<p className="text-muted-foreground text-sm">
								{currentRequest.lastError ??
									"The AI did not finish the previous step cleanly."}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<button
								className="inline-flex h-9 items-center justify-center rounded-[2px] border px-4 text-sm"
								onClick={() => {
									void retryMutation.mutateAsync({
										websiteSlug,
										requestId: currentRequest.id,
									});
								}}
								type="button"
							>
								Retry AI
							</button>
							<button
								className="inline-flex h-9 items-center justify-center rounded-[2px] px-4 text-sm"
								onClick={() => onOpenChange(false)}
								type="button"
							>
								Close
							</button>
						</div>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
