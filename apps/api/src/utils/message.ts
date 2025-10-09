import type { Database } from "@api/db";
import { sendMessages } from "@api/db/queries/message";
import { realtimeEmitter } from "@api/realtime/emitter";
import type {
	Message,
	MessageType,
	MessageVisibility,
} from "@cossistant/types";
import {
	MessageType as MessageTypeValues,
	MessageVisibility as MessageVisibilityValues,
	messageSchema,
} from "@cossistant/types";
import type { RealtimeEventData } from "@cossistant/types/realtime-events";

export function prepareMessageForInsert(bodyMd: string) {
	const normalized = bodyMd.normalize("NFC");

	return { bodyMd: normalized };
}

export type CreateMessageOptions = {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	conversationOwnerVisitorId?: string | null;
	message: {
		bodyMd: string;
		type?: MessageType;
		userId?: string | null;
		aiAgentId?: string | null;
		visitorId?: string | null;
		visibility?: MessageVisibility;
		createdAt?: Date;
	};
};

function serializeMessageForRealtime(
message: Message,
context: {
conversationId: string;
websiteId: string;
organizationId: string;
}
): RealtimeEventData<"MESSAGE_CREATED"> {
return {
message: {
id: message.id,
			bodyMd: message.bodyMd,
			type: message.type,
			userId: message.userId,
			aiAgentId: message.aiAgentId,
			visitorId: message.visitorId,
			organizationId: context.organizationId,
			websiteId: context.websiteId,
			conversationId: message.conversationId,
			parentMessageId: message.parentMessageId,
			modelUsed: message.modelUsed,
			createdAt: message.createdAt,
			updatedAt: message.updatedAt,
			deletedAt: message.deletedAt ? message.deletedAt : null,
			visibility: message.visibility,
},
conversationId: context.conversationId,
websiteId: context.websiteId,
organizationId: context.organizationId,
visitorId: message.visitorId ?? null,
};
}

export async function createMessage(
	options: CreateMessageOptions
): Promise<Message> {
	const { db, organizationId, websiteId, conversationId, message } = options;

	const normalizedBody = prepareMessageForInsert(message.bodyMd);

	const [createdMessage] = await sendMessages(db, {
		organizationId,
		websiteId,
		conversationId,
		messages: [
			{
				bodyMd: normalizedBody.bodyMd,
				type: message.type ?? MessageTypeValues.TEXT,
				userId: message.userId ?? null,
				aiAgentId: message.aiAgentId ?? null,
				visitorId: message.visitorId ?? null,
				conversationId,
				createdAt: message.createdAt
					? message.createdAt.toISOString()
					: new Date().toISOString(),
				visibility: message.visibility ?? MessageVisibilityValues.PUBLIC,
			},
		],
	});

	const parsedMessage = messageSchema.parse(createdMessage);

const realtimePayload = serializeMessageForRealtime(parsedMessage, {
conversationId,
websiteId,
organizationId,
});

let targetVisitorId =
options.conversationOwnerVisitorId ??
realtimePayload.message.visitorId ??
undefined;

if (!targetVisitorId) {
targetVisitorId = await resolveConversationVisitorId(
options.db,
conversationId
);
}

const visitorIdForEvent = targetVisitorId ?? realtimePayload.visitorId ?? null;

const enrichedRealtimePayload: RealtimeEventData<"MESSAGE_CREATED"> = {
...realtimePayload,
visitorId: visitorIdForEvent,
};

await realtimeEmitter.emit("MESSAGE_CREATED", enrichedRealtimePayload, {
websiteId,
visitorId: visitorIdForEvent,
organizationId,
});

return parsedMessage;
}

type GetConversationByIdFn =
	typeof import("@api/db/queries/conversation")["getConversationById"];

let getConversationByIdCached: GetConversationByIdFn | null = null;

async function resolveConversationVisitorId(
	db: Database,
	conversationId: string
): Promise<string | undefined> {
	try {
		if (!getConversationByIdCached) {
			const module = await import("@api/db/queries/conversation");
			getConversationByIdCached = module.getConversationById;
		}

		const conversationRecord = await getConversationByIdCached?.(db, {
			conversationId,
		});

		return conversationRecord?.visitorId ?? undefined;
	} catch (error) {
		console.error("[MESSAGE_CREATED] Failed to resolve conversation visitor", {
			error,
			conversationId,
		});
		return;
	}
}
