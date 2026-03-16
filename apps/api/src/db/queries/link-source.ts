import type { Database } from "@api/db";
import { knowledge } from "@api/db/schema/knowledge";
import {
	type LinkSourceInsert,
	type LinkSourceSelect,
	type LinkSourceStatus,
	linkSource,
} from "@api/db/schema/link-source";
import { generateULID } from "@api/utils/db/ids";
import { and, count, eq, isNull, sql } from "drizzle-orm";

/**
 * Get a link source by ID
 */
export async function getLinkSourceById(
	db: Database,
	params: {
		id: string;
		websiteId: string;
	}
): Promise<LinkSourceSelect | null> {
	const [entry] = await db
		.select()
		.from(linkSource)
		.where(
			and(
				eq(linkSource.id, params.id),
				eq(linkSource.websiteId, params.websiteId),
				isNull(linkSource.deletedAt)
			)
		)
		.limit(1);

	return entry ?? null;
}

/**
 * Get link source by URL (for deduplication)
 */
export async function getLinkSourceByUrl(
	db: Database,
	params: {
		websiteId: string;
		aiAgentId: string | null;
		url: string;
	}
): Promise<LinkSourceSelect | null> {
	const conditions = [
		eq(linkSource.websiteId, params.websiteId),
		eq(linkSource.url, params.url),
		isNull(linkSource.deletedAt),
	];

	// Handle null aiAgentId - shared sources
	if (params.aiAgentId === null) {
		conditions.push(isNull(linkSource.aiAgentId));
	} else {
		conditions.push(eq(linkSource.aiAgentId, params.aiAgentId));
	}

	const [entry] = await db
		.select()
		.from(linkSource)
		.where(and(...conditions))
		.limit(1);

	return entry ?? null;
}

/**
 * List link sources with filters and pagination
 */
export async function listLinkSources(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		aiAgentId?: string | null;
		status?: LinkSourceStatus;
		page?: number;
		limit?: number;
	}
): Promise<{
	items: LinkSourceSelect[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		hasMore: boolean;
	};
}> {
	const page = params.page ?? 1;
	const limit = params.limit ?? 20;
	const offset = (page - 1) * limit;

	// Build where conditions
	const whereConditions = [
		eq(linkSource.organizationId, params.organizationId),
		eq(linkSource.websiteId, params.websiteId),
		isNull(linkSource.deletedAt),
	];

	// Filter by status if provided
	if (params.status) {
		whereConditions.push(eq(linkSource.status, params.status));
	}

	// Filter by aiAgentId if explicitly provided (including null for shared)
	if (params.aiAgentId !== undefined) {
		if (params.aiAgentId === null) {
			whereConditions.push(isNull(linkSource.aiAgentId));
		} else {
			whereConditions.push(eq(linkSource.aiAgentId, params.aiAgentId));
		}
	}

	// Get total count
	const [countResult] = await db
		.select({ total: count() })
		.from(linkSource)
		.where(and(...whereConditions));

	const total = Number(countResult?.total ?? 0);

	// Get paginated items
	const items = await db
		.select()
		.from(linkSource)
		.where(and(...whereConditions))
		.orderBy(linkSource.createdAt)
		.limit(limit)
		.offset(offset);

	return {
		items,
		pagination: {
			page,
			limit,
			total,
			hasMore: page * limit < total,
		},
	};
}

/**
 * Create a new link source
 */
export async function createLinkSource(
	db: Database,
	params: {
		organizationId: string;
		websiteId: string;
		aiAgentId?: string | null;
		parentLinkSourceId?: string | null;
		url: string;
		includePaths?: string[] | null;
		excludePaths?: string[] | null;
		depth?: number;
	}
): Promise<LinkSourceSelect> {
	const now = new Date().toISOString();

	const newEntry: LinkSourceInsert = {
		id: generateULID(),
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgentId ?? null,
		parentLinkSourceId: params.parentLinkSourceId ?? null,
		url: params.url,
		status: "pending",
		depth: params.depth ?? 0,
		discoveredPagesCount: 0,
		crawledPagesCount: 0,
		totalSizeBytes: 0,
		includePaths: params.includePaths ?? null,
		excludePaths: params.excludePaths ?? null,
		createdAt: now,
		updatedAt: now,
	};

	const [entry] = await db.insert(linkSource).values(newEntry).returning();

	if (!entry) {
		throw new Error("Failed to create link source");
	}

	return entry;
}

/**
 * Update link source status and metadata
 */
export async function updateLinkSource(
	db: Database,
	params: {
		id: string;
		websiteId: string;
		status?: LinkSourceStatus;
		firecrawlJobId?: string | null;
		discoveredPagesCount?: number;
		crawledPagesCount?: number;
		totalSizeBytes?: number;
		lastCrawledAt?: string | null;
		errorMessage?: string | null;
		includePaths?: string[] | null;
		excludePaths?: string[] | null;
		ignoredUrls?: string[] | null;
	}
): Promise<LinkSourceSelect | null> {
	const now = new Date().toISOString();

	// Build update object - only include fields that are explicitly provided
	const updateData: Partial<LinkSourceInsert> = {
		updatedAt: now,
	};

	if (params.status !== undefined) {
		updateData.status = params.status;
	}

	if (params.firecrawlJobId !== undefined) {
		updateData.firecrawlJobId = params.firecrawlJobId;
	}

	if (params.discoveredPagesCount !== undefined) {
		updateData.discoveredPagesCount = params.discoveredPagesCount;
	}

	if (params.crawledPagesCount !== undefined) {
		updateData.crawledPagesCount = params.crawledPagesCount;
	}

	if (params.totalSizeBytes !== undefined) {
		updateData.totalSizeBytes = params.totalSizeBytes;
	}

	if (params.lastCrawledAt !== undefined) {
		updateData.lastCrawledAt = params.lastCrawledAt;
	}

	if (params.errorMessage !== undefined) {
		updateData.errorMessage = params.errorMessage;
	}

	if (params.includePaths !== undefined) {
		updateData.includePaths = params.includePaths;
	}

	if (params.excludePaths !== undefined) {
		updateData.excludePaths = params.excludePaths;
	}

	if (params.ignoredUrls !== undefined) {
		updateData.ignoredUrls = params.ignoredUrls;
	}

	const [entry] = await db
		.update(linkSource)
		.set(updateData)
		.where(
			and(
				eq(linkSource.id, params.id),
				eq(linkSource.websiteId, params.websiteId),
				isNull(linkSource.deletedAt)
			)
		)
		.returning();

	return entry ?? null;
}

/**
 * Permanently delete a link source.
 */
export async function deleteLinkSource(
	db: Database,
	params: {
		id: string;
		websiteId: string;
	}
): Promise<boolean> {
	const [entry] = await db
		.delete(linkSource)
		.where(
			and(
				eq(linkSource.id, params.id),
				eq(linkSource.websiteId, params.websiteId)
			)
		)
		.returning({ id: linkSource.id });

	return Boolean(entry);
}

/**
 * Recalculate persisted link source stats from live URL knowledge rows.
 */
export async function syncLinkSourceStatsFromKnowledge(
	db: Database,
	params: {
		id: string;
		websiteId: string;
	}
): Promise<LinkSourceSelect | null> {
	const [result] = await db
		.select({
			crawledPagesCount: count(),
			totalSizeBytes: sql<number>`COALESCE(SUM(${knowledge.sizeBytes}), 0)`,
		})
		.from(knowledge)
		.where(
			and(
				eq(knowledge.websiteId, params.websiteId),
				eq(knowledge.linkSourceId, params.id),
				eq(knowledge.type, "url"),
				isNull(knowledge.deletedAt)
			)
		);

	return updateLinkSource(db, {
		id: params.id,
		websiteId: params.websiteId,
		crawledPagesCount: Number(result?.crawledPagesCount ?? 0),
		totalSizeBytes: Number(result?.totalSizeBytes ?? 0),
	});
}

/**
 * Get link source count for a website
 */
export async function getLinkSourceCount(
	db: Database,
	params: {
		websiteId: string;
		aiAgentId?: string | null;
	}
): Promise<number> {
	const whereConditions = [
		eq(linkSource.websiteId, params.websiteId),
		isNull(linkSource.deletedAt),
	];

	if (params.aiAgentId !== undefined) {
		if (params.aiAgentId === null) {
			whereConditions.push(isNull(linkSource.aiAgentId));
		} else {
			whereConditions.push(eq(linkSource.aiAgentId, params.aiAgentId));
		}
	}

	const [result] = await db
		.select({ count: count() })
		.from(linkSource)
		.where(and(...whereConditions));

	return Number(result?.count ?? 0);
}

/**
 * Get total size of all link sources for a website
 */
export async function getLinkSourceTotalSize(
	db: Database,
	params: {
		websiteId: string;
		aiAgentId?: string | null;
	}
): Promise<number> {
	const whereConditions = [
		eq(linkSource.websiteId, params.websiteId),
		isNull(linkSource.deletedAt),
	];

	if (params.aiAgentId !== undefined) {
		if (params.aiAgentId === null) {
			whereConditions.push(isNull(linkSource.aiAgentId));
		} else {
			whereConditions.push(eq(linkSource.aiAgentId, params.aiAgentId));
		}
	}

	const [result] = await db
		.select({
			total: sql<number>`COALESCE(SUM(${linkSource.totalSizeBytes}), 0)`,
		})
		.from(linkSource)
		.where(and(...whereConditions));

	return Number(result?.total ?? 0);
}
