"use client";

import type { KnowledgeClarificationDraftFaq } from "@cossistant/types";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type KnowledgeClarificationDraftReviewProps = {
	draft: KnowledgeClarificationDraftFaq;
	onApprove: (draft: KnowledgeClarificationDraftFaq) => void | Promise<void>;
	onDismiss?: () => void | Promise<void>;
	isSubmitting?: boolean;
	title?: string;
	description?: string;
	variant?: "dialog" | "page";
};

type KnowledgeClarificationDraftReviewState = {
	draftTitle: string;
	question: string;
	answer: string;
	categories: string;
	relatedQuestions: string;
	setDraftTitle: Dispatch<SetStateAction<string>>;
	setQuestion: Dispatch<SetStateAction<string>>;
	setAnswer: Dispatch<SetStateAction<string>>;
	setCategories: Dispatch<SetStateAction<string>>;
	setRelatedQuestions: Dispatch<SetStateAction<string>>;
	parsedDraft: KnowledgeClarificationDraftFaq;
	canApprove: boolean;
};

type KnowledgeClarificationDraftReviewBodyProps = {
	state: KnowledgeClarificationDraftReviewState;
	title?: string;
	description?: string;
};

export function useKnowledgeClarificationDraftReviewState(
	draft: KnowledgeClarificationDraftFaq | null
): KnowledgeClarificationDraftReviewState {
	const [draftTitle, setDraftTitle] = useState(draft?.title ?? "");
	const [question, setQuestion] = useState(draft?.question ?? "");
	const [answer, setAnswer] = useState(draft?.answer ?? "");
	const [categories, setCategories] = useState(
		draft?.categories.join(", ") ?? ""
	);
	const [relatedQuestions, setRelatedQuestions] = useState(
		draft?.relatedQuestions.join(", ") ?? ""
	);

	useEffect(() => {
		setDraftTitle(draft?.title ?? "");
		setQuestion(draft?.question ?? "");
		setAnswer(draft?.answer ?? "");
		setCategories(draft?.categories.join(", ") ?? "");
		setRelatedQuestions(draft?.relatedQuestions.join(", ") ?? "");
	}, [draft]);

	const canApprove = Boolean(question.trim() && answer.trim());
	const parsedDraft = {
		title: draftTitle.trim() || null,
		question: question.trim(),
		answer: answer.trim(),
		categories: categories
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		relatedQuestions: relatedQuestions
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	};

	return {
		answer,
		categories,
		canApprove,
		draftTitle,
		parsedDraft,
		question,
		relatedQuestions,
		setAnswer,
		setCategories,
		setDraftTitle,
		setQuestion,
		setRelatedQuestions,
	};
}

export function KnowledgeClarificationDraftReviewBody({
	state,
	title = "Review FAQ draft",
	description = "Tweak the proposed FAQ before adding it to the knowledge base.",
}: KnowledgeClarificationDraftReviewBodyProps) {
	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<div className="font-medium text-base">{title}</div>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-title">Proposal title</Label>
					<Input
						id="clarification-draft-title"
						onChange={(event) => state.setDraftTitle(event.target.value)}
						placeholder="Optional internal title"
						value={state.draftTitle}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-question">FAQ question</Label>
					<Input
						id="clarification-draft-question"
						onChange={(event) => state.setQuestion(event.target.value)}
						placeholder="How does this work?"
						value={state.question}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-answer">FAQ answer</Label>
					<Textarea
						className="min-h-[320px] font-mono text-sm"
						id="clarification-draft-answer"
						onChange={(event) => state.setAnswer(event.target.value)}
						rows={14}
						value={state.answer}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-categories">Categories</Label>
					<Input
						id="clarification-draft-categories"
						onChange={(event) => state.setCategories(event.target.value)}
						placeholder="Billing, Plans, Limits"
						value={state.categories}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="clarification-draft-related">Related questions</Label>
					<Input
						id="clarification-draft-related"
						onChange={(event) => state.setRelatedQuestions(event.target.value)}
						placeholder="Comma-separated related questions"
						value={state.relatedQuestions}
					/>
				</div>
			</div>
		</div>
	);
}

export function KnowledgeClarificationDraftReview({
	draft,
	onApprove,
	onDismiss,
	isSubmitting = false,
	title = "Review FAQ draft",
	description = "Tweak the proposed FAQ before adding it to the knowledge base.",
	variant = "dialog",
}: KnowledgeClarificationDraftReviewProps) {
	const state = useKnowledgeClarificationDraftReviewState(draft);

	const footer = (
		<div className="flex items-center justify-between gap-3">
			<Button
				disabled={isSubmitting}
				onClick={() => {
					void onDismiss?.();
				}}
				type="button"
				variant="ghost"
			>
				Close
			</Button>
			<Button
				disabled={isSubmitting || !state.canApprove}
				onClick={() => {
					void onApprove(state.parsedDraft);
				}}
				type="button"
			>
				{isSubmitting ? "Applying..." : "Approve draft"}
			</Button>
		</div>
	);

	if (variant === "page") {
		return (
			<KnowledgeClarificationDraftReviewBody
				description={description}
				state={state}
				title={title}
			/>
		);
	}

	return (
		<div className="space-y-4">
			<div className="rounded-2xl border bg-background p-5 shadow-sm">
				<KnowledgeClarificationDraftReviewBody
					description={description}
					state={state}
					title={title}
				/>
			</div>
			{footer}
		</div>
	);
}

export type { KnowledgeClarificationDraftReviewState };
