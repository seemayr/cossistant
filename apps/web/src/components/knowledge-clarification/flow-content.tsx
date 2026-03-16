"use client";

import type {
	KnowledgeClarificationDraftFaq,
	KnowledgeClarificationRequest,
	KnowledgeClarificationStepResponse,
} from "@cossistant/types";
import { LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	SettingsRow,
	SettingsRowFooter,
} from "@/components/ui/layout/settings-layout";
import { KnowledgeClarificationDraftReview } from "./draft-review";
import { KnowledgeClarificationQuestionCard } from "./question-card";

type KnowledgeClarificationFlowContentProps = {
	variant: "dialog" | "page";
	isLoading?: boolean;
	currentStep: KnowledgeClarificationStepResponse | null;
	fallbackStep: KnowledgeClarificationStepResponse | null;
	currentRequest: KnowledgeClarificationRequest | null;
	isSubmittingAnswer?: boolean;
	isSubmittingApproval?: boolean;
	isRetrying?: boolean;
	onAnswer: (
		requestId: string,
		payload: {
			selectedAnswer?: string;
			freeAnswer?: string;
		}
	) => unknown | Promise<unknown>;
	onDefer: (requestId: string) => unknown | Promise<unknown>;
	onDismiss: (requestId: string) => unknown | Promise<unknown>;
	onApprove: (
		requestId: string,
		draft: KnowledgeClarificationDraftFaq
	) => unknown | Promise<unknown>;
	onRetry: (requestId: string) => unknown | Promise<unknown>;
	onClose: () => unknown | Promise<unknown>;
};

function PageMessageRow({
	title,
	description,
	children,
	footer,
}: {
	title: string;
	description?: string;
	children: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<SettingsRow description={description} title={title}>
			<div className="p-4">{children}</div>
			{footer ? (
				<SettingsRowFooter className="flex items-center justify-end gap-2">
					{footer}
				</SettingsRowFooter>
			) : null}
		</SettingsRow>
	);
}

function RetryState({
	currentRequest,
	isRetrying = false,
	onClose,
	onRetry,
	variant,
}: Pick<
	KnowledgeClarificationFlowContentProps,
	"currentRequest" | "isRetrying" | "onClose" | "onRetry" | "variant"
>) {
	if (!currentRequest) {
		return null;
	}

	if (variant === "page") {
		return (
			<PageMessageRow
				description="Retry the flow if the AI did not complete the previous step cleanly."
				footer={
					<Button
						onClick={() => {
							void onRetry(currentRequest.id);
						}}
						type="button"
						variant="outline"
					>
						<LoaderCircleIcon
							className={`size-4 ${isRetrying ? "animate-spin" : ""}`}
						/>
						Retry
					</Button>
				}
				title="Needs attention"
			>
				<p className="text-muted-foreground text-sm">
					{currentRequest.lastError ??
						"The AI did not finish the previous step cleanly."}
				</p>
			</PageMessageRow>
		);
	}

	return (
		<div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-10 text-center">
			<LoaderCircleIcon
				className={`h-6 w-6 ${isRetrying ? "animate-spin" : ""}`}
			/>
			<div className="space-y-1">
				<div className="font-medium">This clarification needs a retry</div>
				<p className="text-muted-foreground text-sm">
					{currentRequest.lastError ??
						"The AI did not finish the previous step cleanly."}
				</p>
			</div>
			<div className="flex items-center gap-2">
				<button
					className="inline-flex h-9 items-center justify-center rounded-[2px] border px-4 text-sm"
					onClick={() => {
						void onRetry(currentRequest.id);
					}}
					type="button"
				>
					Retry AI
				</button>
				<button
					className="inline-flex h-9 items-center justify-center rounded-[2px] px-4 text-sm"
					onClick={() => {
						void onClose();
					}}
					type="button"
				>
					Close
				</button>
			</div>
		</div>
	);
}

export function KnowledgeClarificationFlowContent({
	variant,
	isLoading = false,
	currentStep,
	fallbackStep,
	currentRequest,
	isSubmittingAnswer = false,
	isSubmittingApproval = false,
	isRetrying = false,
	onAnswer,
	onDefer,
	onDismiss,
	onApprove,
	onRetry,
	onClose,
}: KnowledgeClarificationFlowContentProps) {
	if (isLoading) {
		return variant === "page" ? (
			<PageMessageRow
				description="Loading this clarification flow."
				title="Loading"
			>
				<div className="flex items-center gap-3 text-muted-foreground text-sm">
					<LoaderCircleIcon className="size-4 animate-spin" />
					Preparing AI suggestion...
				</div>
			</PageMessageRow>
		) : (
			<div className="flex items-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-muted-foreground text-sm">
				<LoaderCircleIcon className="size-4 animate-spin" />
				Preparing AI suggestion...
			</div>
		);
	}

	if (currentStep?.kind === "question") {
		if (variant === "page") {
			return (
				<SettingsRow
					description="Answer the current question now, save it for later, or remove it entirely."
					title="Clarification"
				>
					<div className="p-4">
						<KnowledgeClarificationQuestionCard
							description="Answer one short question so the AI can complete the draft."
							isAnalyzing={isSubmittingAnswer}
							isSubmitting={isSubmittingAnswer}
							maxSteps={currentStep.request.maxSteps}
							onDefer={() => {
								void onDefer(currentStep.request.id);
							}}
							onDismiss={() => {
								void onDismiss(currentStep.request.id);
							}}
							onSubmit={(payload) => {
								void onAnswer(currentStep.request.id, payload);
							}}
							question={currentStep.question}
							stepIndex={currentStep.request.stepIndex}
							suggestedAnswers={currentStep.suggestedAnswers}
							variant="page"
						/>
					</div>
				</SettingsRow>
			);
		}

		return (
			<KnowledgeClarificationQuestionCard
				description="Answer the current question now, save it for later, or remove it entirely."
				isAnalyzing={isSubmittingAnswer}
				isSubmitting={isSubmittingAnswer}
				maxSteps={currentStep.request.maxSteps}
				onDefer={() => {
					void onDefer(currentStep.request.id);
				}}
				onDismiss={() => {
					void onDismiss(currentStep.request.id);
				}}
				onSubmit={(payload) => {
					void onAnswer(currentStep.request.id, payload);
				}}
				question={currentStep.question}
				stepIndex={currentStep.request.stepIndex}
				suggestedAnswers={currentStep.suggestedAnswers}
				variant="dialog"
			/>
		);
	}

	if (currentStep?.kind === "draft_ready") {
		return (
			<KnowledgeClarificationDraftReview
				draft={currentStep.draftFaqPayload}
				isSubmitting={isSubmittingApproval}
				onApprove={(draft) => {
					void onApprove(currentStep.request.id, draft);
				}}
				onDismiss={() => {
					void onClose();
				}}
				variant={variant}
			/>
		);
	}

	if (fallbackStep?.kind === "question") {
		if (variant === "page") {
			return (
				<SettingsRow
					description="This suggestion is waiting for another answer."
					title="Clarification"
				>
					<div className="p-4">
						<KnowledgeClarificationQuestionCard
							description="This suggestion is waiting for another answer."
							isSubmitting={isSubmittingAnswer}
							maxSteps={fallbackStep.request.maxSteps}
							onDefer={() => {
								void onDefer(fallbackStep.request.id);
							}}
							onDismiss={() => {
								void onDismiss(fallbackStep.request.id);
							}}
							onSubmit={(payload) => {
								void onAnswer(fallbackStep.request.id, payload);
							}}
							question={fallbackStep.question}
							stepIndex={fallbackStep.request.stepIndex}
							suggestedAnswers={fallbackStep.suggestedAnswers}
							variant="page"
						/>
					</div>
				</SettingsRow>
			);
		}

		return (
			<KnowledgeClarificationQuestionCard
				description="This proposal is waiting for another answer."
				isSubmitting={isSubmittingAnswer}
				maxSteps={fallbackStep.request.maxSteps}
				onDefer={() => {
					void onDefer(fallbackStep.request.id);
				}}
				onDismiss={() => {
					void onDismiss(fallbackStep.request.id);
				}}
				onSubmit={(payload) => {
					void onAnswer(fallbackStep.request.id, payload);
				}}
				question={fallbackStep.question}
				stepIndex={fallbackStep.request.stepIndex}
				suggestedAnswers={fallbackStep.suggestedAnswers}
				variant="dialog"
			/>
		);
	}

	if (fallbackStep?.kind === "draft_ready") {
		return (
			<KnowledgeClarificationDraftReview
				draft={fallbackStep.draftFaqPayload}
				isSubmitting={isSubmittingApproval}
				onApprove={(draft) => {
					void onApprove(fallbackStep.request.id, draft);
				}}
				onDismiss={() => {
					void onClose();
				}}
				variant={variant}
			/>
		);
	}

	if (currentRequest) {
		return (
			<RetryState
				currentRequest={currentRequest}
				isRetrying={isRetrying}
				onClose={onClose}
				onRetry={onRetry}
				variant={variant}
			/>
		);
	}

	return variant === "page" ? (
		<PageMessageRow
			description="This AI suggestion no longer exists."
			title="Unavailable"
		>
			<div className="text-muted-foreground text-sm">
				This AI suggestion is no longer available.
			</div>
		</PageMessageRow>
	) : null;
}

export type { KnowledgeClarificationFlowContentProps };
