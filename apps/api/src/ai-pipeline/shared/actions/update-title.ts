/**
 * Update Title Action
 *
 * Updates the conversation title (background analysis).
 * Creates a private event - not visible to visitors.
 * Emits real-time event for dashboard and widget updates.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { conversation } from "@api/db/schema/conversation";
import { realtime } from "@api/realtime/emitter";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { eq } from "drizzle-orm";

type UpdateTitleParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	title: string;
};

/**
 * Normalize title for comparison (lowercase, trim whitespace)
 */
function normalizeTitle(title: string): string {
	return title.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Check if two titles are meaningfully different
 */
function isTitleDifferent(oldTitle: string | null, newTitle: string): boolean {
	if (!oldTitle) {
		return true;
	}
	return normalizeTitle(oldTitle) !== normalizeTitle(newTitle);
}

/**
 * Update conversation title
 */
export async function updateTitle(params: UpdateTitleParams): Promise<void> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		title,
	} = params;

	// Skip if title is not meaningfully different
	if (!isTitleDifferent(conv.title, title)) {
		return;
	}

	const isUpdate = Boolean(conv.title);
	const now = new Date().toISOString();

	// Update conversation
	await db
		.update(conversation)
		.set({
			title,
			updatedAt: now,
		})
		.where(eq(conversation.id, conv.id));

	// Create private timeline event (uses createTimelineItem for proper realtime emission)
	const eventText = isUpdate
		? `AI updated title: "${title}" (was: "${conv.title}")`
		: `AI generated title: "${title}"`;

	await createTimelineItem({
		db,
		organizationId,
		websiteId,
		conversationId: conv.id,
		conversationOwnerVisitorId: conv.visitorId,
		item: {
			type: ConversationTimelineType.EVENT,
			visibility: TimelineItemVisibility.PRIVATE,
			text: eventText,
			parts: [{ type: "text", text: eventText }],
			aiAgentId,
		},
	});

	// Emit conversationUpdated event for real-time dashboard and widget updates
	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId: conv.visitorId,
		userId: null,
		conversationId: conv.id,
		updates: {
			title,
		},
		aiAgentId,
	});
}
