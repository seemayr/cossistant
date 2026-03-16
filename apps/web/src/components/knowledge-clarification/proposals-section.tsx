"use client";

import type { KnowledgeClarificationRequest } from "@cossistant/types";
import {
	TrainingEntryList,
	TrainingEntryListSection,
	TrainingEntryRow,
	useTrainingEntryPrefetch,
} from "@/components/training-entries";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";

type KnowledgeClarificationProposalsSectionProps = {
	websiteSlug: string;
	proposals: KnowledgeClarificationRequest[];
	className?: string;
};

type ProposalAppearance = {
	statusLabel: string;
	statusVariant: "secondary" | "success";
};

function getProposalPrimaryLabel(
	proposal: KnowledgeClarificationRequest
): string {
	return (
		proposal.topicSummary ||
		proposal.draftFaqPayload?.question ||
		proposal.currentQuestion ||
		"AI Suggestion"
	);
}

function getProposalAppearance(
	proposal: KnowledgeClarificationRequest
): ProposalAppearance {
	if (proposal.status === "draft_ready" && proposal.draftFaqPayload) {
		return {
			statusLabel: "Ready for review",
			statusVariant: "success",
		};
	}

	if (proposal.status === "analyzing") {
		return {
			statusLabel: "AI working",
			statusVariant: "secondary",
		};
	}

	return {
		statusLabel: `Step ${Math.max(proposal.stepIndex, 1)} of ${proposal.maxSteps}`,
		statusVariant: "secondary",
	};
}

export function KnowledgeClarificationProposalsSection({
	websiteSlug,
	proposals,
	className,
}: KnowledgeClarificationProposalsSectionProps) {
	const { prefetchProposal } = useTrainingEntryPrefetch(websiteSlug);

	if (proposals.length === 0) {
		return null;
	}

	return (
		<TrainingEntryListSection
			className={className}
			description="Draft FAQs and clarification threads the AI wants you to review."
			title={`AI Suggestions (${proposals.length})`}
		>
			<TrainingEntryList>
				{proposals.map((proposal) => {
					const appearance = getProposalAppearance(proposal);
					const href = `/${websiteSlug}/agent/training/faq/proposals/${proposal.id}`;

					return (
						<TrainingEntryRow
							href={href}
							icon={<Logo className="size-4 text-cossistant-orange" />}
							key={proposal.id}
							onHoverPrefetch={() => prefetchProposal(proposal.id, href)}
							primary={getProposalPrimaryLabel(proposal)}
							rightMeta={
								<div className="flex flex-wrap items-center justify-end gap-2 text-xs">
									<Badge variant="secondary">AI Suggestion</Badge>
									<Badge variant={appearance.statusVariant}>
										{appearance.statusLabel}
									</Badge>
								</div>
							}
						/>
					);
				})}
			</TrainingEntryList>
		</TrainingEntryListSection>
	);
}

export type { KnowledgeClarificationProposalsSectionProps };
