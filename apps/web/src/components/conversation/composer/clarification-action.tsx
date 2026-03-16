"use client";

import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { stepFromKnowledgeClarificationRequest } from "@/components/knowledge-clarification/helpers";
import { KnowledgeClarificationQuestionCard } from "@/components/knowledge-clarification/question-card";
import { useKnowledgeClarificationQueryInvalidation } from "@/components/knowledge-clarification/use-query-invalidation";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export type ClarificationActionProps = {
	websiteSlug: string;
	request: KnowledgeClarificationRequest | null;
	className?: string;
};

export const ClarificationAction: React.FC<ClarificationActionProps> = ({
	websiteSlug,
	request,
	className,
}) => {
	const trpc = useTRPC();
	const invalidateClarificationQueries =
		useKnowledgeClarificationQueryInvalidation(websiteSlug);
	const [localStep, setLocalStep] = useState(
		stepFromKnowledgeClarificationRequest(request)
	);

	useEffect(() => {
		setLocalStep(stepFromKnowledgeClarificationRequest(request));
	}, [request]);

	const answerMutation = useMutation(
		trpc.knowledgeClarification.answer.mutationOptions({
			onSuccess: async (result) => {
				setLocalStep(result.step);
				await invalidateClarificationQueries({
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
			onSuccess: async (nextRequest) => {
				await invalidateClarificationQueries({
					request: nextRequest,
				});
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save clarification for later");
			},
		})
	);

	const dismissMutation = useMutation(
		trpc.knowledgeClarification.dismiss.mutationOptions({
			onSuccess: async (nextRequest) => {
				await invalidateClarificationQueries({
					request: nextRequest,
				});
			},
			onError: (error) => {
				toast.error(error.message || "Failed to remove clarification");
			},
		})
	);

	const step = useMemo(
		() => localStep ?? stepFromKnowledgeClarificationRequest(request),
		[localStep, request]
	);

	return step?.kind === "question" ? (
		<KnowledgeClarificationQuestionCard
			className={className}
			description="The AI is asking for a precise internal answer so it can improve the FAQ without handing this conversation to a human."
			isAnalyzing={answerMutation.isPending}
			isSubmitting={answerMutation.isPending}
			maxSteps={step.request.maxSteps}
			onDefer={() => {
				void deferMutation.mutateAsync({
					websiteSlug,
					requestId: step.request.id,
				});
			}}
			onDismiss={() => {
				void dismissMutation.mutateAsync({
					websiteSlug,
					requestId: step.request.id,
				});
			}}
			onSubmit={(payload) => {
				void answerMutation.mutateAsync({
					websiteSlug,
					requestId: step.request.id,
					...payload,
				});
			}}
			question={step.question}
			stepIndex={step.request.stepIndex}
			suggestedAnswers={step.suggestedAnswers}
			title="AI needs a little more precision"
		/>
	) : (
		<div
			className={cn(
				"flex items-center gap-2 p-4 text-muted-foreground text-sm",
				className
			)}
		>
			<LoaderCircleIcon className="h-4 w-4 animate-spin" />
			{request
				? "Preparing the clarification flow..."
				: "Loading clarification..."}
		</div>
	);
};
