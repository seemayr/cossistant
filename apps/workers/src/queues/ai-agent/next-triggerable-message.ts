import { getConversationMessagesAfterCursor } from "@api/db/queries/conversation";
import type { Database } from "@workers/db";

export type TriggerableMessage = {
	id: string;
	createdAt: string;
};

export async function findNextTriggerableMessageAfterCursor(params: {
	db: Database;
	organizationId: string;
	conversationId: string;
	afterCreatedAt: string;
	afterId: string;
}): Promise<TriggerableMessage | null> {
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
