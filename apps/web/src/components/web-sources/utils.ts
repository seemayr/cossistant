import type { KnowledgePage, LinkSource } from "@/data/link-source-cache";

/**
 * Format bytes to human readable string (KB, MB, etc.)
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 KB";
	}

	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${Math.round(kb)} KB`;
	}

	const mb = kb / 1024;
	return `${mb.toFixed(1)} MB`;
}

/**
 * Merged page node for the unified domain tree
 * Includes source information for pages from different crawl sources
 */
export type MergedPageNode = {
	url: string;
	path: string;
	title: string | null;
	knowledgeId: string;
	linkSourceId: string;
	linkSourceUrl: string;
	isIncluded: boolean;
	sizeBytes: number;
	updatedAt: string;
	descendantCount: number;
	children: MergedPageNode[];
};

/**
 * Domain summary for the tree header
 */
export type DomainSummary = {
	domain: string;
	sources: LinkSource[];
	totalPages: number;
	totalSizeBytes: number;
	hasActiveCrawl: boolean;
};

/**
 * Build a merged domain tree from multiple link sources
 * Pages from different sources under the same domain are merged into one hierarchical tree
 */
export function buildMergedDomainTree(
	sources: LinkSource[],
	pagesMap: Map<string, KnowledgePage[]>
): MergedPageNode[] {
	const root: MergedPageNode[] = [];
	const nodeMap = new Map<string, MergedPageNode>();

	// Collect all pages from all sources with their source info
	const allPages: Array<{
		page: KnowledgePage;
		source: LinkSource;
	}> = [];

	for (const source of sources) {
		const pages = pagesMap.get(source.id) ?? [];
		for (const page of pages) {
			allPages.push({ page, source });
		}
	}

	// Sort pages by URL path depth (shallower paths first)
	const sortedPages = [...allPages].sort((a, b) => {
		const pathA = a.page.sourceUrl ? new URL(a.page.sourceUrl).pathname : "";
		const pathB = b.page.sourceUrl ? new URL(b.page.sourceUrl).pathname : "";
		return pathA.split("/").length - pathB.split("/").length;
	});

	for (const { page, source } of sortedPages) {
		if (!page.sourceUrl) {
			continue;
		}

		try {
			const url = new URL(page.sourceUrl);
			const path = url.pathname;

			// Check if node already exists (from another source)
			// If so, skip - first source wins
			if (nodeMap.has(path)) {
				continue;
			}

			const node: MergedPageNode = {
				url: page.sourceUrl,
				path,
				title: page.sourceTitle,
				knowledgeId: page.id,
				linkSourceId: source.id,
				linkSourceUrl: source.url,
				isIncluded: page.isIncluded,
				sizeBytes: page.sizeBytes,
				updatedAt: page.updatedAt,
				descendantCount: 0,
				children: [],
			};

			nodeMap.set(path, node);

			// Find parent by walking up the path segments
			const segments = path.split("/").filter(Boolean);
			let parentNode: MergedPageNode | null = null;

			// Try to find the closest ancestor that exists
			for (let i = segments.length - 1; i > 0; i--) {
				const parentPath = `/${segments.slice(0, i).join("/")}`;
				const potentialParent = nodeMap.get(parentPath);
				if (potentialParent) {
					parentNode = potentialParent;
					break;
				}
			}

			if (parentNode) {
				parentNode.children.push(node);
			} else {
				root.push(node);
			}
		} catch {
			// Invalid URL, add to root
			root.push({
				url: page.sourceUrl,
				path: page.sourceUrl,
				title: page.sourceTitle,
				knowledgeId: page.id,
				linkSourceId: source.id,
				linkSourceUrl: source.url,
				isIncluded: page.isIncluded,
				sizeBytes: page.sizeBytes,
				updatedAt: page.updatedAt,
				descendantCount: 0,
				children: [],
			});
		}
	}

	// Sort root nodes and children alphabetically by path
	const sortNodes = (nodes: MergedPageNode[]): void => {
		nodes.sort((a, b) => a.path.localeCompare(b.path));
		for (const node of nodes) {
			if (node.children.length > 0) {
				sortNodes(node.children);
			}
		}
	};

	sortNodes(root);

	const setDescendantCounts = (node: MergedPageNode): number => {
		let totalDescendants = 0;

		for (const child of node.children) {
			totalDescendants += 1 + setDescendantCounts(child);
		}

		node.descendantCount = totalDescendants;
		return totalDescendants;
	};

	for (const node of root) {
		setDescendantCounts(node);
	}

	return root;
}

/**
 * Calculate domain summary from sources
 * Uses crawledPagesCount from sources directly (no need to fetch all pages)
 */
export function calculateDomainSummary(
	domain: string,
	sources: LinkSource[]
): DomainSummary {
	let totalPages = 0;
	let totalSizeBytes = 0;
	let hasActiveCrawl = false;

	for (const source of sources) {
		totalPages += source.crawledPagesCount;
		totalSizeBytes += source.totalSizeBytes;

		if (
			source.status === "crawling" ||
			source.status === "mapping" ||
			source.status === "pending"
		) {
			hasActiveCrawl = true;
		}
	}

	return {
		domain,
		sources,
		totalPages,
		totalSizeBytes,
		hasActiveCrawl,
	};
}

/**
 * Get the tree label for a URL path.
 * Root paths stay as "/", while nested paths use only their final segment.
 */
export function getPathDisplayName(path: string): string {
	const segments = path.split("/").filter(Boolean);
	if (segments.length === 0) {
		return "/";
	}
	return segments.at(-1) ?? path;
}

/**
 * Check if a link source is actively crawling
 */
export function isSourceActive(source: LinkSource): boolean {
	return (
		source.status === "crawling" ||
		source.status === "mapping" ||
		source.status === "pending"
	);
}

/**
 * Tree line characters for ASCII tree visualization
 * Uses box-drawing characters for a familiar tree command look
 */
const TREE_CHARS = {
	BRANCH: "├── ", // Branch with siblings below
	LAST_BRANCH: "└── ", // Last branch (no siblings below)
	VERTICAL: "│   ", // Vertical continuation line
	EMPTY: "    ", // Empty space for alignment
} as const;

/**
 * Context for generating tree line prefixes
 */
export type TreeLineContext = {
	isLast: boolean;
	ancestorsAreLastChild: boolean[];
};

/**
 * Generate ASCII tree prefix string for a node
 * Creates the familiar tree command visualization:
 *
 * ├── /docs
 * │   ├── /getting-started
 * │   │   └── /installation
 * │   └── /api
 * └── /changelog
 */
export function generateTreePrefix(context: TreeLineContext): string {
	const { isLast, ancestorsAreLastChild } = context;

	let prefix = "";

	// Add continuation lines for each ancestor level
	for (const ancestorIsLast of ancestorsAreLastChild) {
		prefix += ancestorIsLast ? TREE_CHARS.EMPTY : TREE_CHARS.VERTICAL;
	}

	// Add the branch character for current item
	prefix += isLast ? TREE_CHARS.LAST_BRANCH : TREE_CHARS.BRANCH;

	return prefix;
}
