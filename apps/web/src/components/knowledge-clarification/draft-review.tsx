"use client";

import type { KnowledgeClarificationDraftFaq } from "@cossistant/types";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	SettingsRow,
	SettingsRowFooter,
} from "@/components/ui/layout/settings-layout";
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

export function KnowledgeClarificationDraftReview({
	draft,
	onApprove,
	onDismiss,
	isSubmitting = false,
	title = "Review FAQ draft",
	description = "Tweak the proposed FAQ before adding it to the knowledge base.",
	variant = "dialog",
}: KnowledgeClarificationDraftReviewProps) {
	const [draftTitle, setDraftTitle] = useState(draft.title ?? "");
	const [question, setQuestion] = useState(draft.question);
	const [answer, setAnswer] = useState(draft.answer);
	const [categories, setCategories] = useState(draft.categories.join(", "));
	const [relatedQuestions, setRelatedQuestions] = useState(
		draft.relatedQuestions.join(", ")
	);

	useEffect(() => {
		setDraftTitle(draft.title ?? "");
		setQuestion(draft.question);
		setAnswer(draft.answer);
		setCategories(draft.categories.join(", "));
		setRelatedQuestions(draft.relatedQuestions.join(", "));
	}, [draft]);

	const canApprove = Boolean(question.trim() && answer.trim());
	const parsedDraft: KnowledgeClarificationDraftFaq = {
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

	const fields = (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="clarification-draft-title">Proposal title</Label>
				<Input
					id="clarification-draft-title"
					onChange={(event) => setDraftTitle(event.target.value)}
					placeholder="Optional internal title"
					value={draftTitle}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="clarification-draft-question">FAQ question</Label>
				<Input
					id="clarification-draft-question"
					onChange={(event) => setQuestion(event.target.value)}
					placeholder="How does this work?"
					value={question}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="clarification-draft-answer">FAQ answer</Label>
				<Textarea
					className="min-h-[320px] font-mono text-sm"
					id="clarification-draft-answer"
					onChange={(event) => setAnswer(event.target.value)}
					rows={14}
					value={answer}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="clarification-draft-categories">Categories</Label>
				<Input
					id="clarification-draft-categories"
					onChange={(event) => setCategories(event.target.value)}
					placeholder="Billing, Plans, Limits"
					value={categories}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="clarification-draft-related">Related questions</Label>
				<Input
					id="clarification-draft-related"
					onChange={(event) => setRelatedQuestions(event.target.value)}
					placeholder="Comma-separated related questions"
					value={relatedQuestions}
				/>
			</div>
		</div>
	);

	const footer = (
		<>
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
				disabled={isSubmitting || !canApprove}
				onClick={() => {
					void onApprove(parsedDraft);
				}}
				type="button"
			>
				{isSubmitting ? "Applying..." : "Approve draft"}
			</Button>
		</>
	);

	if (variant === "page") {
		return (
			<SettingsRow description={description} title={title}>
				<div className="p-4">{fields}</div>
				<SettingsRowFooter className="flex items-center justify-between gap-3">
					{footer}
				</SettingsRowFooter>
			</SettingsRow>
		);
	}

	return (
		<div className="space-y-4">
			<div className="rounded-2xl border bg-background p-5 shadow-sm">
				<div className="space-y-1 pb-5">
					<div className="font-medium text-base">{title}</div>
					<p className="text-muted-foreground text-sm">{description}</p>
				</div>
				{fields}
			</div>
			<div className="flex items-center justify-between gap-3">{footer}</div>
		</div>
	);
}
