"use client";

import type { ConversationClarificationSummary } from "@cossistant/types";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useKnowledgeClarificationQueryInvalidation } from "@/components/knowledge-clarification/use-query-invalidation";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import Icon from "../../ui/icons";

export type ClarificationPromptProps = {
	websiteSlug: string;
	summary: ConversationClarificationSummary;
	onClarify: () => void;
	className?: string;
};

export function ClarificationPrompt({
	websiteSlug,
	summary,
	onClarify,
	className,
}: ClarificationPromptProps) {
	const trpc = useTRPC();
	const invalidateClarificationQueries =
		useKnowledgeClarificationQueryInvalidation(websiteSlug);
	const deferMutation = useMutation(
		trpc.knowledgeClarification.defer.mutationOptions({
			onSuccess: async (request) => {
				await invalidateClarificationQueries({ request });
			},
			onError: (error) => {
				toast.error(error.message || "Failed to save clarification for later");
			},
		})
	);
	const dismissMutation = useMutation(
		trpc.knowledgeClarification.dismiss.mutationOptions({
			onSuccess: async (request) => {
				await invalidateClarificationQueries({ request });
			},
			onError: (error) => {
				toast.error(error.message || "Failed to remove clarification");
			},
		})
	);
	const isPending = deferMutation.isPending || dismissMutation.isPending;

	return (
		<div className={cn("px-2 pt-2 pb-2", className)}>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="font-medium text-xs">Clarification</div>
					<p className="text-muted-foreground text-sm">
						{summary.topicSummary}
					</p>
				</div>
				<Button
					className="absolute top-2 right-2"
					disabled={isPending}
					onClick={() => {
						// void dismissMutation.mutateAsync({
						//   websiteSlug,
						//   requestId: summary.requestId,
						// });
						void deferMutation.mutateAsync({
							websiteSlug,
							requestId: summary.requestId,
						});
					}}
					size="icon-small"
					type="button"
					variant="ghost"
				>
					<Icon className="size-3.5" name="x" variant="filled" />
				</Button>
			</div>

			<div className="mt-6 flex flex-wrap items-center justify-end gap-2">
				<Button
					disabled={isPending}
					onClick={() => {
						void deferMutation.mutateAsync({
							websiteSlug,
							requestId: summary.requestId,
						});
					}}
					size="xs"
					type="button"
					variant="ghost"
				>
					Later
				</Button>
				<Button
					disabled={isPending}
					onClick={onClarify}
					size="xs"
					type="button"
				>
					Clarify
				</Button>
			</div>
		</div>
	);
}
