/**
 * Categorize Action
 *
 * Adds a conversation to a view/category.
 */

import type { Database } from "@api/db";
import { listConversationViewIds } from "@api/db/queries/conversation";
import { conversationView } from "@api/db/schema/conversation";
import { realtime } from "@api/realtime/emitter";
import { generateShortPrimaryId } from "@api/utils/db/ids";
import { and, eq, isNull } from "drizzle-orm";

type CategorizeParams = {
	db: Database;
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	viewId: string;
	aiAgentId: string;
	emitTimelineEvent?: boolean;
};

/**
 * Add a conversation to a view
 */
export async function categorize(params: CategorizeParams): Promise<{
	changed: boolean;
	reason?: "already_categorized";
	viewIds?: string[];
}> {
	const {
		db,
		conversationId,
		organizationId,
		websiteId,
		visitorId,
		viewId,
		aiAgentId,
	} = params;

	const now = new Date().toISOString();

	// Check if already in view
	const existing = await db
		.select({ id: conversationView.id })
		.from(conversationView)
		.where(
			and(
				eq(conversationView.conversationId, conversationId),
				eq(conversationView.viewId, viewId),
				isNull(conversationView.deletedAt)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		return {
			changed: false,
			reason: "already_categorized",
		};
	}

	// Add to view
	await db.insert(conversationView).values({
		id: generateShortPrimaryId(),
		conversationId,
		organizationId,
		viewId,
		addedByAiAgentId: aiAgentId,
		addedByUserId: null,
		createdAt: now,
	});

	const viewIds = await listConversationViewIds(db, {
		organizationId,
		conversationId,
	});

	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId,
		userId: null,
		conversationId,
		updates: {
			viewIds,
		},
		aiAgentId,
	});

	return {
		changed: true,
		viewIds,
	};
}
