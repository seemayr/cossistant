"use client";

import type { KnowledgeClarificationRequest } from "@cossistant/types";
import { formatDistanceToNow } from "date-fns";
import { BotIcon, FileStackIcon, SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type KnowledgeClarificationProposalsSectionProps = {
	proposals: KnowledgeClarificationRequest[];
	onOpenProposal: (request: KnowledgeClarificationRequest) => void;
	className?: string;
};

type ProposalAppearance = {
	badgeLabel: string;
	badgeVariant: "secondary" | "success";
	description: string;
	previewLabel: string;
	ctaLabel: string;
	ctaVariant: "default" | "outline";
	iconClassName: string;
	Icon: typeof BotIcon;
};

function getSourceLabel(
	source: KnowledgeClarificationRequest["source"]
): string {
	return source === "faq" ? "From FAQ" : "From conversation";
}

function getProposalPreviewText(
	proposal: KnowledgeClarificationRequest
): string {
	return (
		proposal.draftFaqPayload?.question ??
		proposal.currentQuestion ??
		proposal.lastError ??
		"Open this proposal to continue the clarification flow."
	);
}

function getProposalAppearance(
	proposal: KnowledgeClarificationRequest
): ProposalAppearance {
	if (proposal.status === "draft_ready" && proposal.draftFaqPayload) {
		return {
			badgeLabel: "Draft FAQ",
			badgeVariant: "success",
			description: "The AI wrote this FAQ draft. Review it before adding it.",
			previewLabel: "Draft",
			ctaLabel: "Review draft",
			ctaVariant: "default",
			iconClassName:
				"bg-cossistant-green/10 text-cossistant-green dark:bg-cossistant-green/15",
			Icon: SparklesIcon,
		};
	}

	if (proposal.status === "analyzing") {
		return {
			badgeLabel: "AI working",
			badgeVariant: "secondary",
			description: "The AI is working on the next step for this FAQ.",
			previewLabel: "Topic",
			ctaLabel: "Open",
			ctaVariant: "outline",
			iconClassName: "bg-background-300 text-primary/70 dark:bg-background-400",
			Icon: BotIcon,
		};
	}

	return {
		badgeLabel: "Needs your answer",
		badgeVariant: "secondary",
		description: "Answer one follow-up question so the AI can finish the FAQ.",
		previewLabel: proposal.lastError ? "Issue" : "Question",
		ctaLabel: "Continue",
		ctaVariant: "outline",
		iconClassName:
			"bg-cossistant-orange/10 text-cossistant-orange dark:bg-cossistant-orange/15",
		Icon: BotIcon,
	};
}

export function KnowledgeClarificationProposalsSection({
	proposals,
	onOpenProposal,
	className,
}: KnowledgeClarificationProposalsSectionProps) {
	if (proposals.length === 0) {
		return null;
	}

	return (
		<section
			className={cn("space-y-4", className)}
			data-slot="knowledge-clarification-proposals"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background-200 text-primary/60 dark:bg-background-300">
						<FileStackIcon className="h-4 w-4" />
					</div>
					<div className="space-y-1">
						<div className="font-medium text-base">
							FAQ drafts and follow-up questions
						</div>
						<p className="text-muted-foreground text-sm">
							These are saved questions and draft FAQs the AI wants you to
							review.
						</p>
					</div>
				</div>

				<Badge className="mt-1" variant="secondary">
					{proposals.length} open
				</Badge>
			</div>

			<div className="space-y-3">
				{proposals.map((proposal) => {
					const appearance = getProposalAppearance(proposal);
					const updatedLabel = formatDistanceToNow(
						new Date(proposal.updatedAt),
						{ addSuffix: true }
					);

					return (
						<article
							className="rounded-2xl bg-background-100/80 p-5 shadow-sm transition-colors hover:bg-background-200/80 dark:bg-background-200/70 dark:hover:bg-background-300/70"
							data-slot="knowledge-clarification-proposal"
							key={proposal.id}
						>
							<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant={appearance.badgeVariant}>
											{appearance.badgeLabel}
										</Badge>
										<Badge
											className="border-transparent text-muted-foreground"
											variant="secondary"
										>
											{getSourceLabel(proposal.source)}
										</Badge>
										<span className="text-muted-foreground text-xs">
											Updated {updatedLabel}
										</span>
									</div>

									<div className="mt-4 flex items-start gap-3">
										<div
											className={cn(
												"mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl",
												appearance.iconClassName
											)}
										>
											<appearance.Icon className="h-4 w-4" />
										</div>

										<div className="min-w-0 space-y-2">
											<h3 className="text-balance font-medium text-base leading-tight">
												{proposal.topicSummary}
											</h3>
											<p className="text-muted-foreground text-sm">
												{appearance.description}
											</p>
											<div className="rounded-xl bg-background px-3 py-2 dark:bg-background-100">
												<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
													{appearance.previewLabel}
												</div>
												<p className="mt-1 text-sm leading-6">
													{getProposalPreviewText(proposal)}
												</p>
											</div>
										</div>
									</div>
								</div>

								<Button
									className="w-full shrink-0 lg:w-auto"
									onClick={() => onOpenProposal(proposal)}
									type="button"
									variant={appearance.ctaVariant}
								>
									<appearance.Icon className="h-4 w-4" />
									{appearance.ctaLabel}
								</Button>
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}

export type { KnowledgeClarificationProposalsSectionProps };
