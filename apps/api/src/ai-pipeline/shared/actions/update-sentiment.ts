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
	emitTimelineEvent?: boolean;
};

function isSentimentEffectivelyUnchanged(params: {
	currentSentiment: ConversationSelect["sentiment"];
	currentConfidence: ConversationSelect["sentimentConfidence"];
	nextSentiment: UpdateSentimentParams["sentiment"];
	nextConfidence: number;
}): boolean {
	if (params.currentSentiment !== params.nextSentiment) {
		return false;
	}

	if (typeof params.currentConfidence !== "number") {
		return false;
	}

	return Math.abs(params.currentConfidence - params.nextConfidence) < 0.01;
}

/**
 * Update conversation sentiment
 */
export async function updateSentiment(params: UpdateSentimentParams): Promise<{
	changed: boolean;
	reason?: "unchanged";
}> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		sentiment,
		confidence,
		emitTimelineEvent = false,
	} = params;

	if (
		isSentimentEffectivelyUnchanged({
			currentSentiment: conv.sentiment,
			currentConfidence: conv.sentimentConfidence,
			nextSentiment: sentiment,
			nextConfidence: confidence,
		})
	) {
		return {
			changed: false,
			reason: "unchanged",
		};
	}

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

	if (emitTimelineEvent) {
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
	}

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

	return {
		changed: true,
	};
}
