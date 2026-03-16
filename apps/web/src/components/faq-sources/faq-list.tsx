"use client";

import type { KnowledgeResponse } from "@cossistant/types";
import { useQuery } from "@tanstack/react-query";
import { HelpCircleIcon } from "lucide-react";
import type * as React from "react";
import { useTRPC } from "@/lib/trpc/client";
import { FaqListItem } from "./faq-list-item";

type FaqListProps = {
	websiteSlug: string;
	aiAgentId: string | null;
	onEdit: (faq: KnowledgeResponse) => void;
	onDeepen: (faq: KnowledgeResponse) => void;
	onDelete: (id: string) => void;
	onToggleIncluded: (id: string, isIncluded: boolean) => void;
	isDeleting?: boolean;
	isToggling?: boolean;
	emptyState?: React.ReactNode;
};

export function FaqList({
	websiteSlug,
	aiAgentId,
	onEdit,
	onDeepen,
	onDelete,
	onToggleIncluded,
	isDeleting,
	isToggling,
	emptyState,
}: FaqListProps) {
	const trpc = useTRPC();

	const { data, isLoading } = useQuery(
		trpc.knowledge.list.queryOptions({
			websiteSlug,
			type: "faq",
			aiAgentId,
			limit: 100,
		})
	);

	if (isLoading) {
		return (
			<div className="space-y-3">
				{[1, 2, 3].map((i) => (
					<div
						className="h-24 animate-pulse rounded-lg border bg-muted"
						key={i}
					/>
				))}
			</div>
		);
	}

	const faqs = data?.items ?? [];

	if (faqs.length === 0) {
		return (
			emptyState ?? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
					<HelpCircleIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
					<p className="mb-2 text-center font-medium">No FAQs yet</p>
					<p className="max-w-md text-center text-muted-foreground text-sm">
						Add frequently asked questions and answers to help your AI agent
						respond to common customer inquiries.
					</p>
				</div>
			)
		);
	}

	return (
		<div className="space-y-3">
			{faqs.map((faq) => (
				<FaqListItem
					faq={faq}
					isDeleting={isDeleting}
					isToggling={isToggling}
					key={faq.id}
					onDeepen={onDeepen}
					onDelete={onDelete}
					onEdit={onEdit}
					onToggleIncluded={onToggleIncluded}
				/>
			))}
		</div>
	);
}

export type { FaqListProps };
