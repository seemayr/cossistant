"use client";

import { GlobeIcon } from "lucide-react";
import type * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMergedDomainTree } from "../hooks/use-merged-domain-tree";
import { DomainNode } from "./domain-node";

type DomainTreeProps = {
	websiteSlug: string;
	aiAgentId: string | null;
	emptyState?: React.ReactNode;
};

export function DomainTree({
	websiteSlug,
	aiAgentId,
	emptyState,
}: DomainTreeProps) {
	const { groupedDomainData, isLoading, error, totalDomains } =
		useMergedDomainTree({
			websiteSlug,
			aiAgentId,
		});

	if (isLoading) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-20 w-full" />
				<Skeleton className="h-20 w-full" />
			</div>
		);
	}

	if (error) {
		return (
			<Card className="border-destructive">
				<CardContent className="flex flex-col items-center justify-center py-12">
					<p className="text-center text-destructive">
						Failed to load web sources: {error.message}
					</p>
				</CardContent>
			</Card>
		);
	}

	if (totalDomains === 0) {
		return (
			emptyState ?? (
				<Card className="border-dashed">
					<CardContent className="flex flex-col items-center justify-center py-12">
						<GlobeIcon className="mb-4 size-6 text-muted-foreground" />
						<p className="text-center text-muted-foreground text-sm">
							No link sources yet. Add a website URL above to get started.
						</p>
					</CardContent>
				</Card>
			)
		);
	}

	// Sort domains alphabetically
	const sortedDomains = [...groupedDomainData.entries()].sort((a, b) =>
		a[0].localeCompare(b[0])
	);

	return (
		<div className="space-y-3">
			{sortedDomains.map(([domain, data]) => (
				<DomainNode
					aiAgentId={aiAgentId}
					defaultExpanded={sortedDomains.length === 1}
					domain={domain}
					hasActiveCrawl={data.summary.hasActiveCrawl}
					key={domain}
					sources={data.sources}
					totalPages={data.summary.totalPages}
					totalSizeBytes={data.summary.totalSizeBytes}
					websiteSlug={websiteSlug}
				/>
			))}
		</div>
	);
}

export type { DomainTreeProps };
