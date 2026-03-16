"use client";

import type { KnowledgeClarificationDraftFaq } from "@cossistant/types";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type KnowledgeClarificationDraftReviewProps = {
	draft: KnowledgeClarificationDraftFaq;
	onApprove: (draft: KnowledgeClarificationDraftFaq) => void | Promise<void>;
	onDismiss?: () => void | Promise<void>;
	isSubmitting?: boolean;
	title?: string;
	description?: string;
};

export function KnowledgeClarificationDraftReview({
	draft,
	onApprove,
	onDismiss,
	isSubmitting = false,
	title = "Review FAQ draft",
	description = "Tweak the proposed FAQ before adding it to the knowledge base.",
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

	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h3 className="font-semibold text-xl">{title}</h3>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>

			<div className="space-y-3">
				<div className="space-y-2">
					<label
						className="font-medium text-sm"
						htmlFor="clarification-draft-title"
					>
						Proposal title
					</label>
					<Input
						id="clarification-draft-title"
						onChange={(event) => setDraftTitle(event.target.value)}
						placeholder="Optional internal title"
						value={draftTitle}
					/>
				</div>
				<div className="space-y-2">
					<label
						className="font-medium text-sm"
						htmlFor="clarification-draft-question"
					>
						FAQ question
					</label>
					<Input
						id="clarification-draft-question"
						onChange={(event) => setQuestion(event.target.value)}
						placeholder="How does this work?"
						value={question}
					/>
				</div>
				<div className="space-y-2">
					<label
						className="font-medium text-sm"
						htmlFor="clarification-draft-answer"
					>
						FAQ answer
					</label>
					<Textarea
						id="clarification-draft-answer"
						onChange={(event) => setAnswer(event.target.value)}
						rows={8}
						value={answer}
					/>
				</div>
				<div className="space-y-2">
					<label
						className="font-medium text-sm"
						htmlFor="clarification-draft-categories"
					>
						Categories
					</label>
					<Input
						id="clarification-draft-categories"
						onChange={(event) => setCategories(event.target.value)}
						placeholder="Billing, Plans, Limits"
						value={categories}
					/>
				</div>
				<div className="space-y-2">
					<label
						className="font-medium text-sm"
						htmlFor="clarification-draft-related"
					>
						Related questions
					</label>
					<Input
						id="clarification-draft-related"
						onChange={(event) => setRelatedQuestions(event.target.value)}
						placeholder="Comma-separated related questions"
						value={relatedQuestions}
					/>
				</div>
			</div>

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
					disabled={isSubmitting || !question.trim() || !answer.trim()}
					onClick={() => {
						void onApprove({
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
						});
					}}
					type="button"
				>
					{isSubmitting ? "Applying..." : "Approve draft"}
				</Button>
			</div>
		</div>
	);
}
