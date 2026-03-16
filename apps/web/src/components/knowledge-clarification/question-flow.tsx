"use client";

import { useEffect, useId, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Spinner } from "../../../../../packages/react/src/support/components/spinner";
import { Separator } from "../ui/separator";

export type KnowledgeClarificationAnswerPayload = {
	selectedAnswer?: string;
	freeAnswer?: string;
};

export type KnowledgeClarificationAnswerDraftState = {
	selectedAnswer: string | null;
	freeAnswer: string;
};

const EMPTY_ANSWER_DRAFT_STATE: KnowledgeClarificationAnswerDraftState = {
	selectedAnswer: null,
	freeAnswer: "",
};

export function isKnowledgeClarificationOtherSelected(freeAnswer: string) {
	return freeAnswer.trim().length > 0;
}

export function getKnowledgeClarificationSubmitPayload(
	state: KnowledgeClarificationAnswerDraftState
): KnowledgeClarificationAnswerPayload | null {
	const trimmedFreeAnswer = state.freeAnswer.trim();

	if (trimmedFreeAnswer) {
		return { freeAnswer: trimmedFreeAnswer };
	}

	return state.selectedAnswer ? { selectedAnswer: state.selectedAnswer } : null;
}

export function selectKnowledgeClarificationAnswer(
	answer: string
): KnowledgeClarificationAnswerDraftState {
	return {
		selectedAnswer: answer,
		freeAnswer: "",
	};
}

export function changeKnowledgeClarificationFreeAnswer(
	currentState: KnowledgeClarificationAnswerDraftState,
	freeAnswer: string
): KnowledgeClarificationAnswerDraftState {
	return {
		selectedAnswer: freeAnswer.length > 0 ? null : currentState.selectedAnswer,
		freeAnswer,
	};
}

export type KnowledgeClarificationQuestionContentProps = {
	question: string;
	suggestedAnswers: [string, string, string] | string[];
	selectedAnswer: string | null;
	freeAnswer: string;
	isOtherSelected: boolean;
	isSubmitting?: boolean;
	isAnalyzing?: boolean;
	className?: string;
	onSelectAnswer: (answer: string) => void;
	onFreeAnswerChange: (value: string) => void;
};

export function useKnowledgeClarificationAnswerDraft(
	question: string | null | undefined
) {
	const [draftState, setDraftState] =
		useState<KnowledgeClarificationAnswerDraftState>(EMPTY_ANSWER_DRAFT_STATE);
	const isOtherSelected = isKnowledgeClarificationOtherSelected(
		draftState.freeAnswer
	);

	useEffect(() => {
		setDraftState(EMPTY_ANSWER_DRAFT_STATE);
	}, [question]);

	const submitPayload = getKnowledgeClarificationSubmitPayload(draftState);

	return {
		canSubmit: Boolean(submitPayload),
		freeAnswer: draftState.freeAnswer,
		isOtherSelected,
		selectedAnswer: draftState.selectedAnswer,
		setFreeAnswer: (value: string) => {
			setDraftState((currentState) =>
				changeKnowledgeClarificationFreeAnswer(currentState, value)
			);
		},
		selectAnswer: (answer: string) => {
			setDraftState(selectKnowledgeClarificationAnswer(answer));
		},
		submitPayload,
	};
}

export function KnowledgeClarificationQuestionContent({
	question,
	suggestedAnswers,
	selectedAnswer,
	freeAnswer,
	isOtherSelected,
	isSubmitting = false,
	isAnalyzing = false,
	className,
	onSelectAnswer,
	onFreeAnswerChange,
}: KnowledgeClarificationQuestionContentProps) {
	const otherAnswerId = useId();

	return (
		<div className={cn("space-y-4", className)}>
			<div className="space-y-3">
				<h3 className="font-bold text-sm leading-tight">{question}</h3>
				{isAnalyzing ? (
					<div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
						<Spinner size={16} />
						Analyzing and preparing the next step...
					</div>
				) : null}
			</div>
			<div className="space-y-2">
				{suggestedAnswers.map((answer, index) => {
					const isSelected = selectedAnswer === answer;

					return (
						<button
							className={cn(
								"flex w-full items-start gap-3 py-2 text-left text-sm transition-colors hover:cursor-pointer",
								isSelected
									? "text-cossistant-orange"
									: "text-primary/70 hover:text-primary"
							)}
							disabled={isSubmitting || isAnalyzing}
							key={answer}
							onClick={() => onSelectAnswer(answer)}
							type="button"
						>
							<div
								className={cn(
									"mt-1 flex size-3 shrink-0 items-center justify-center rounded font-bold text-xs",
									isSelected ? "text-cossistant-orange" : "text-primary/70"
								)}
							>
								{index + 1}.
							</div>
							<div>{answer}</div>
						</button>
					);
				})}

				<Separator className="opacity-80" />

				<div
					className={cn(
						"flex w-full items-start gap-3 py-2 text-sm transition-colors",
						isOtherSelected
							? "text-cossistant-orange"
							: "text-primary/70 focus-within:text-primary"
					)}
				>
					<div
						className={cn(
							"mt-1 flex size-3 shrink-0 items-center justify-center rounded font-bold text-xs",
							isOtherSelected ? "text-cossistant-orange" : "text-primary/70"
						)}
					>
						4.
					</div>
					<div className="min-w-0 flex-1">
						<label className="sr-only" htmlFor={otherAnswerId}>
							Custom answer
						</label>
						<Textarea
							aria-label="Custom answer"
							className={cn(
								"min-h-auto resize-none rounded-none border-0 bg-transparent px-0 py-0 text-inherit shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
								!isOtherSelected && "text-primary/70"
							)}
							disabled={isSubmitting || isAnalyzing}
							id={otherAnswerId}
							maxLength={500}
							onChange={(event) => onFreeAnswerChange(event.target.value)}
							placeholder="Type your answer here..."
							rows={2}
							value={freeAnswer}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
