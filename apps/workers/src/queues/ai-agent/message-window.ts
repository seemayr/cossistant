import {
	getConversationMessagesAfterCursor,
	getMessageMetadata,
} from "@api/db/queries/conversation";
import type { AiAgentRunCursor } from "@cossistant/jobs";
import type { Database } from "@workers/db";

export type TriggerableWindowMessage = {
	id: string;
	createdAt: string;
};

export async function buildMessageWindowFromCursor(params: {
	db: Database;
	organizationId: string;
	conversationId: string;
	cursor: AiAgentRunCursor;
}): Promise<TriggerableWindowMessage[]> {
	const messages: TriggerableWindowMessage[] = [];
	const dedupe = new Set<string>();

	const cursorMessage = await getMessageMetadata(params.db, {
		messageId: params.cursor.messageId,
		organizationId: params.organizationId,
	});

	if (
		cursorMessage &&
		cursorMessage.conversationId === params.conversationId &&
		(cursorMessage.userId || cursorMessage.visitorId)
	) {
		messages.push({
			id: cursorMessage.id,
			createdAt: cursorMessage.createdAt,
		});
		dedupe.add(cursorMessage.id);
	}

	const trailingMessages = await getConversationMessagesAfterCursor(params.db, {
		organizationId: params.organizationId,
		conversationId: params.conversationId,
		afterCreatedAt: params.cursor.messageCreatedAt,
		afterId: params.cursor.messageId,
	});

	for (const message of trailingMessages) {
		if (dedupe.has(message.id)) {
			continue;
		}
		dedupe.add(message.id);
		messages.push({
			id: message.id,
			createdAt: message.createdAt,
		});
	}

	return messages;
}

export async function findNextTriggerableMessageAfterCursor(params: {
	db: Database;
	organizationId: string;
	conversationId: string;
	afterCreatedAt: string;
	afterId: string;
}): Promise<TriggerableWindowMessage | null> {
	const next = await getConversationMessagesAfterCursor(params.db, {
		organizationId: params.organizationId,
		conversationId: params.conversationId,
		afterCreatedAt: params.afterCreatedAt,
		afterId: params.afterId,
		limit: 1,
	});

	const first = next[0];

	if (!first) {
		return null;
	}

	return {
		id: first.id,
		createdAt: first.createdAt,
	};
}
