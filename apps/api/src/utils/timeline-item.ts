import type { Database } from "@api/db";
import { getConversationById } from "@api/db/queries/conversation";
import { conversationTimelineItem } from "@api/db/schema";
import { realtime } from "@api/realtime/emitter";
import { generateULID } from "@api/utils/db/ids";
import { scheduleConversationUnseenDigest } from "@api/utils/conversation-notifications";
import {
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { timelineItemSchema } from "@cossistant/types/api/timeline-item";
import type { RealtimeEventData } from "@cossistant/types/realtime-events";

export type CreateTimelineItemOptions = {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	conversationOwnerVisitorId?: string | null;
	item: {
		id?: string;
		type:
			| typeof ConversationTimelineType.MESSAGE
			| typeof ConversationTimelineType.EVENT;
		text?: string | null;
		parts: unknown[];
		userId?: string | null;
		aiAgentId?: string | null;
		visitorId?: string | null;
		visibility?:
			| typeof TimelineItemVisibility.PUBLIC
			| typeof TimelineItemVisibility.PRIVATE;
		createdAt?: Date;
	};
};

type TimelineItem = {
	id: string;
	conversationId: string;
	organizationId: string;
	visibility:
		| typeof TimelineItemVisibility.PUBLIC
		| typeof TimelineItemVisibility.PRIVATE;
	type:
		| typeof ConversationTimelineType.MESSAGE
		| typeof ConversationTimelineType.EVENT;
	text: string | null;
	parts: unknown;
	userId: string | null;
	visitorId: string | null;
	aiAgentId: string | null;
	createdAt: string;
	deletedAt: string | null;
};

function serializeTimelineItemForRealtime(
	item: TimelineItem,
	context: {
		conversationId: string;
		websiteId: string;
		organizationId: string;
		userId: string | null;
		visitorId: string | null;
	}
): RealtimeEventData<"timelineItemCreated"> {
	return {
		item: {
			id: item.id,
			conversationId: item.conversationId,
			organizationId: item.organizationId,
			visibility: item.visibility,
			type:
				item.type === ConversationTimelineType.MESSAGE ? "message" : "event",
			text: item.text,
			parts: item.parts as unknown[],
			userId: item.userId,
			visitorId: item.visitorId,
			aiAgentId: item.aiAgentId,
			createdAt: item.createdAt,
			deletedAt: item.deletedAt,
		},
		conversationId: context.conversationId,
		websiteId: context.websiteId,
		organizationId: context.organizationId,
		userId: context.userId,
		visitorId: context.visitorId,
	};
}

export async function createTimelineItem(
	options: CreateTimelineItemOptions
): Promise<TimelineItem> {
	const { db, organizationId, websiteId, conversationId, item } = options;

	const timelineItemId = item.id ?? generateULID();
	const createdAt = item.createdAt
		? item.createdAt.toISOString()
		: new Date().toISOString();

	const [createdItem] = await db
		.insert(conversationTimelineItem)
		.values({
			id: timelineItemId,
			conversationId,
			organizationId,
			visibility: item.visibility ?? TimelineItemVisibility.PUBLIC,
			type: item.type,
			text: item.text ?? null,
			parts: item.parts as unknown,
			userId: item.userId ?? null,
			visitorId: item.visitorId ?? null,
			aiAgentId: item.aiAgentId ?? null,
			createdAt,
			deletedAt: null,
		})
		.returning();

	const parsedItem = timelineItemSchema.parse({
		...createdItem,
		parts: createdItem.parts,
	});

	let visitorIdForEvent =
		options.conversationOwnerVisitorId ?? parsedItem.visitorId ?? null;

	if (!visitorIdForEvent) {
		visitorIdForEvent =
			(await resolveConversationVisitorId(options.db, conversationId)) ?? null;
	}

	if (!parsedItem.id) {
		throw new Error("Timeline item ID is required");
	}

	const realtimePayload = serializeTimelineItemForRealtime(
		{
			id: parsedItem.id,
			conversationId: parsedItem.conversationId,
			organizationId: parsedItem.organizationId,
			visibility: parsedItem.visibility,
			type: parsedItem.type,
			text: parsedItem.text ?? null,
			parts: parsedItem.parts,
			userId: parsedItem.userId,
			visitorId: parsedItem.visitorId,
			aiAgentId: parsedItem.aiAgentId,
			createdAt: parsedItem.createdAt,
			deletedAt: parsedItem.deletedAt ?? null,
		},
		{
			conversationId,
			websiteId,
			organizationId,
			userId: parsedItem.userId,
			visitorId: visitorIdForEvent,
		}
	);

        await realtime.emit("timelineItemCreated", realtimePayload);

        if (
                item.type === ConversationTimelineType.MESSAGE &&
                (item.visibility ?? TimelineItemVisibility.PUBLIC) ===
                        TimelineItemVisibility.PUBLIC
        ) {
                await scheduleConversationUnseenDigest({
                        conversationId,
                        organizationId,
                });
        }

	return {
		id: parsedItem.id,
		conversationId: parsedItem.conversationId,
		organizationId: parsedItem.organizationId,
		visibility: parsedItem.visibility,
		type: parsedItem.type,
		text: parsedItem.text ?? null,
		parts: parsedItem.parts,
		userId: parsedItem.userId,
		visitorId: parsedItem.visitorId,
		aiAgentId: parsedItem.aiAgentId,
		createdAt: parsedItem.createdAt,
		deletedAt: parsedItem.deletedAt ?? null,
	};
}

async function resolveConversationVisitorId(
	db: Database,
	conversationId: string
): Promise<string | undefined> {
	try {
		const conversationRecord = await getConversationById(db, {
			conversationId,
		});
		return conversationRecord?.visitorId ?? undefined;
	} catch (error) {
		console.error(
			"[TIMELINE_ITEM_CREATED] Failed to resolve conversation visitor",
			{
				error,
				conversationId,
			}
		);
		return;
	}
}
