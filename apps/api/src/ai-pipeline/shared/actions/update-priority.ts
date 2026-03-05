/**
 * Update Priority Action
 *
 * Updates the conversation priority.
 * Creates a private event - not visible to visitors.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { conversation } from "@api/db/schema/conversation";
import { realtime } from "@api/realtime/emitter";
import { createConversationEvent } from "@api/utils/conversation-event";
import {
	ConversationEventType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { eq } from "drizzle-orm";

type UpdatePriorityParams = {
	db: Database;
	conversation: ConversationSelect;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	newPriority: "low" | "normal" | "high" | "urgent";
};

/**
 * Update conversation priority
 */
export async function updatePriority(
	params: UpdatePriorityParams
): Promise<void> {
	const {
		db,
		conversation: conv,
		organizationId,
		websiteId,
		aiAgentId,
		newPriority,
	} = params;

	// Skip if already at desired priority
	if (conv.priority === newPriority) {
		return;
	}

	const now = new Date();
	const nowIso = now.toISOString();

	const [updatedConversation] = await db
		.update(conversation)
		.set({
			priority: newPriority,
			updatedAt: nowIso,
		})
		.where(eq(conversation.id, conv.id))
		.returning();

	if (!updatedConversation) {
		return;
	}

	await createConversationEvent({
		db,
		context: {
			conversationId: conv.id,
			organizationId,
			websiteId,
			visitorId: conv.visitorId,
		},
		event: {
			type: ConversationEventType.PRIORITY_CHANGED,
			actorAiAgentId: aiAgentId,
			metadata: {
				previousPriority: conv.priority,
				newPriority,
			},
			createdAt: now,
			visibility: TimelineItemVisibility.PRIVATE,
		},
	});

	await realtime.emit("conversationUpdated", {
		websiteId,
		organizationId,
		visitorId: null,
		userId: null,
		conversationId: conv.id,
		updates: {
			priority: updatedConversation.priority,
		},
		aiAgentId,
	});
}
