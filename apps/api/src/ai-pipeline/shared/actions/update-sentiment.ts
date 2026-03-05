/**
 * Update Sentiment Action
 *
 * Updates the conversation sentiment (background analysis).
 * Creates a private event - not visible to visitors.
 * Emits real-time event for dashboard updates.
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

type UpdateSentimentParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	sentiment: "positive" | "negative" | "neutral";
	confidence: number;
};

/**
 * Update conversation sentiment
 */
export async function updateSentiment(
	params: UpdateSentimentParams
): Promise<void> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		sentiment,
		confidence,
	} = params;

	const now = new Date().toISOString();

	// Update conversation
	await db
		.update(conversation)
		.set({
			sentiment,
			sentimentConfidence: confidence,
			updatedAt: now,
		})
		.where(eq(conversation.id, conv.id));

	// Create private timeline event (AI_ANALYZED) with proper realtime emission
	const eventText = `AI analyzed sentiment: ${sentiment} (${Math.round(confidence * 100)}% confidence)`;
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

	// Emit conversationUpdated event for real-time dashboard updates
	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId: conv.visitorId,
		userId: null,
		conversationId: conv.id,
		updates: {
			sentiment,
			sentimentConfidence: confidence,
		},
		aiAgentId,
	});
}
