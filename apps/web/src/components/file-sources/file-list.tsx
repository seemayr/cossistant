"use client";

import type { KnowledgeResponse } from "@cossistant/types";
import { useQuery } from "@tanstack/react-query";
import { FileTextIcon } from "lucide-react";
import type * as React from "react";
import { useTRPC } from "@/lib/trpc/client";
import { FileListItem } from "./file-list-item";

type FileListProps = {
	websiteSlug: string;
	aiAgentId: string | null;
	onEdit: (file: KnowledgeResponse) => void;
	onDelete: (id: string) => void;
	onToggleIncluded: (id: string, isIncluded: boolean) => void;
	isDeleting?: boolean;
	isToggling?: boolean;
	emptyState?: React.ReactNode;
};

export function FileList({
	websiteSlug,
	aiAgentId,
	onEdit,
	onDelete,
	onToggleIncluded,
	isDeleting,
	isToggling,
	emptyState,
}: FileListProps) {
	const trpc = useTRPC();

	const { data, isLoading } = useQuery(
		trpc.knowledge.list.queryOptions({
			websiteSlug,
			type: "article",
			aiAgentId,
			limit: 100,
		})
	);

	if (isLoading) {
		return (
			<div className="space-y-3">
				{[1, 2, 3].map((i) => (
					<div
						className="h-20 animate-pulse rounded-lg border bg-muted"
						key={i}
					/>
				))}
			</div>
		);
	}

	const files = data?.items ?? [];

	if (files.length === 0) {
		return (
			emptyState ?? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
					<FileTextIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
					<p className="mb-2 text-center font-medium">No files yet</p>
					<p className="max-w-md text-center text-muted-foreground text-sm">
						Add markdown files or documentation to help your AI agent understand
						your product better.
					</p>
				</div>
			)
		);
	}

	return (
		<div className="space-y-3">
			{files.map((file) => (
				<FileListItem
					file={file}
					isDeleting={isDeleting}
					isToggling={isToggling}
					key={file.id}
					onDelete={onDelete}
					onEdit={onEdit}
					onToggleIncluded={onToggleIncluded}
				/>
			))}
		</div>
	);
}

export type { FileListProps };
