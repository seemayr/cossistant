"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import { generateTreePrefix, type MergedPageNode } from "../utils";
import { PageTreeItemView } from "./page-tree-item";

type PageTreeNodeProps = {
	node: MergedPageNode;
	websiteSlug: string;
	linkSourceId: string;
	onToggleIncluded: (knowledgeId: string, isIncluded: boolean) => void;
	onReindex?: (linkSourceId: string, knowledgeId: string) => void;
	onDelete?: (knowledgeId: string) => void;
	onIgnore?: (linkSourceId: string, knowledgeId: string) => void;
	onScanSubpages?: (linkSourceId: string, knowledgeId: string) => void;
	isToggling: boolean;
	isReindexing?: boolean;
	isDeleting?: boolean;
	isIgnoring?: boolean;
	// Tree visualization context
	isLast: boolean;
	ancestorsAreLastChild: boolean[];
};

export function PageTreeNode({
	node,
	websiteSlug,
	linkSourceId,
	onToggleIncluded,
	onReindex,
	onDelete,
	onIgnore,
	onScanSubpages,
	isToggling,
	isReindexing = false,
	isDeleting = false,
	isIgnoring = false,
	isLast,
	ancestorsAreLastChild,
}: PageTreeNodeProps) {
	const hasChildren = node.children.length > 0;
	const [isExpanded, setIsExpanded] = useState(() => !hasChildren);
	const [, setKnowledgeId] = useQueryState("knowledge", parseAsString);

	// Generate the ASCII tree prefix for this node
	const treePrefix = useMemo(
		() => generateTreePrefix({ isLast, ancestorsAreLastChild }),
		[isLast, ancestorsAreLastChild]
	);

	const handleToggleExpand = useCallback(() => {
		setIsExpanded((prev) => !prev);
	}, []);

	const handleToggleIncluded = useCallback(() => {
		onToggleIncluded(node.knowledgeId, !node.isIncluded);
	}, [node.knowledgeId, node.isIncluded, onToggleIncluded]);

	const handleViewContent = useCallback(() => {
		void setKnowledgeId(node.knowledgeId);
	}, [node.knowledgeId, setKnowledgeId]);

	const handleReindex = useCallback(() => {
		onReindex?.(linkSourceId, node.knowledgeId);
	}, [linkSourceId, node.knowledgeId, onReindex]);

	const handleDelete = useCallback(() => {
		onDelete?.(node.knowledgeId);
	}, [node.knowledgeId, onDelete]);

	const handleIgnore = useCallback(() => {
		onIgnore?.(linkSourceId, node.knowledgeId);
	}, [linkSourceId, node.knowledgeId, onIgnore]);

	return (
		<div className="select-none">
			<PageTreeItemView
				hasChildren={hasChildren}
				isDeleting={isDeleting}
				isExpanded={isExpanded}
				isIgnoring={isIgnoring}
				isIncluded={node.isIncluded}
				isReindexing={isReindexing}
				isToggling={isToggling}
				onDelete={onDelete ? handleDelete : undefined}
				onIgnore={onIgnore ? handleIgnore : undefined}
				onReindex={onReindex ? handleReindex : undefined}
				onToggleExpand={handleToggleExpand}
				onToggleIncluded={handleToggleIncluded}
				onViewContent={handleViewContent}
				pageCount={node.descendantCount}
				path={node.path}
				sizeBytes={node.sizeBytes}
				sourceUrl={node.linkSourceUrl}
				title={node.title}
				treePrefix={treePrefix}
				updatedAt={node.updatedAt}
				url={node.url}
			/>

			{/* Children */}
			{hasChildren && isExpanded && (
				<div>
					{node.children.map((child, index) => (
						<PageTreeNode
							ancestorsAreLastChild={[...ancestorsAreLastChild, isLast]}
							isDeleting={isDeleting}
							isIgnoring={isIgnoring}
							isLast={index === node.children.length - 1}
							isReindexing={isReindexing}
							isToggling={isToggling}
							key={child.knowledgeId}
							linkSourceId={linkSourceId}
							node={child}
							onDelete={onDelete}
							onIgnore={onIgnore}
							onReindex={onReindex}
							onScanSubpages={onScanSubpages}
							onToggleIncluded={onToggleIncluded}
							websiteSlug={websiteSlug}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export type { PageTreeNodeProps };
