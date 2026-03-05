/**
 * Categorize Action
 *
 * Adds a conversation to a view/category.
 */

import type { Database } from "@api/db";
import { conversationView } from "@api/db/schema/conversation";
import { generateShortPrimaryId } from "@api/utils/db/ids";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { and, eq, isNull } from "drizzle-orm";

type CategorizeParams = {
	db: Database;
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	viewId: string;
	aiAgentId: string;
};

/**
 * Add a conversation to a view
 */
export async function categorize(params: CategorizeParams): Promise<void> {
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
		// Already categorized
		return;
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

	// Create timeline event with proper realtime emission
	const eventText = "AI categorized conversation";
	await createTimelineItem({
		db,
		organizationId,
		websiteId,
		conversationId,
		conversationOwnerVisitorId: visitorId,
		item: {
			type: ConversationTimelineType.EVENT,
			visibility: TimelineItemVisibility.PRIVATE,
			text: eventText,
			parts: [{ type: "text", text: eventText }],
			aiAgentId,
		},
	});
}
