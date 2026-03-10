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
	emitTimelineEvent?: boolean;
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
export async function updateTitle(params: UpdateTitleParams): Promise<{
	changed: boolean;
	reason?: "unchanged" | "manual_title";
}> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		title,
		emitTimelineEvent = false,
	} = params;

	if (conv.titleSource === "user") {
		return {
			changed: false,
			reason: "manual_title",
		};
	}

	// Skip if title is not meaningfully different
	if (!isTitleDifferent(conv.title, title)) {
		return {
			changed: false,
			reason: "unchanged",
		};
	}

	const isUpdate = Boolean(conv.title);
	const now = new Date().toISOString();

	// Update conversation
	await db
		.update(conversation)
		.set({
			title,
			titleSource: "ai",
			updatedAt: now,
		})
		.where(eq(conversation.id, conv.id));

	if (emitTimelineEvent) {
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
	}

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

	return {
		changed: true,
	};
}
