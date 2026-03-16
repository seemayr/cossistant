"use client";

import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SettingsRow } from "@/components/ui/layout/settings-layout";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { TrainingEntryDetailLayout } from "../training-entries";
import { KnowledgeClarificationFlowContent } from "./flow-content";
import { useKnowledgeClarificationFlow } from "./use-clarification-flow";

type KnowledgeClarificationProposalPageProps = {
	requestId: string;
};

function getStatusLabel(request: KnowledgeClarificationRequest): string {
	if (request.status === "draft_ready") {
		return "Ready for review";
	}

	if (request.status === "analyzing") {
		return "AI working";
	}

	return `Step ${Math.max(request.stepIndex, 1)} of ${request.maxSteps}`;
}

export function KnowledgeClarificationProposalPage({
	requestId,
}: KnowledgeClarificationProposalPageProps) {
	const website = useWebsite();
	const trpc = useTRPC();
	const router = useRouter();

	const { data, isLoading } = useQuery(
		trpc.knowledgeClarification.getProposal.queryOptions({
			websiteSlug: website.slug,
			requestId,
		})
	);
	const flow = useKnowledgeClarificationFlow({
		websiteSlug: website.slug,
		initialRequest: data?.request ?? null,
		onApproved: async (result) => {
			toast.success("FAQ draft approved");
			router.push(`/${website.slug}/agent/training/faq/${result.knowledge.id}`);
		},
		onDeferred: async () => {
			router.push(`/${website.slug}/agent/training/faq`);
		},
		onDismissed: async () => {
			router.push(`/${website.slug}/agent/training/faq`);
		},
	});

	const headerTitle = useMemo(() => {
		if (flow.currentRequest?.draftFaqPayload?.question) {
			return flow.currentRequest.draftFaqPayload.question;
		}

		return flow.currentRequest?.topicSummary ?? "AI suggestion";
	}, [flow.currentRequest]);

	return (
		<TrainingEntryDetailLayout
			backHref={`/${website.slug}/agent/training/faq`}
			title={headerTitle}
		>
			<SettingsRow
				description="Review the AI suggestion, continue the clarification flow, or turn it into a saved FAQ."
				title="AI suggestion"
			>
				<div className="flex flex-wrap items-center gap-2 p-4">
					<Badge variant="secondary">AI Suggestion</Badge>
					{flow.currentRequest ? (
						<Badge
							variant={
								flow.currentRequest.status === "draft_ready"
									? "success"
									: "secondary"
							}
						>
							{getStatusLabel(flow.currentRequest)}
						</Badge>
					) : null}
				</div>
			</SettingsRow>
			<KnowledgeClarificationFlowContent
				currentRequest={flow.currentRequest}
				currentStep={flow.currentStep}
				fallbackStep={flow.fallbackStep}
				isLoading={isLoading}
				isRetrying={flow.retryMutation.isPending}
				isSubmittingAnswer={flow.answerMutation.isPending}
				isSubmittingApproval={flow.approveMutation.isPending}
				onAnswer={flow.submitAnswer}
				onApprove={flow.approveDraft}
				onClose={() => {
					router.push(`/${website.slug}/agent/training/faq`);
				}}
				onDefer={flow.deferRequest}
				onDismiss={flow.dismissRequest}
				onRetry={flow.retryRequest}
				variant="page"
			/>
		</TrainingEntryDetailLayout>
	);
}

export type { KnowledgeClarificationProposalPageProps };
