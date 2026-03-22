import type { Database } from "@api/db";
import { conversation } from "@api/db/schema/conversation";
import { eq } from "drizzle-orm";

export async function loadCurrentConversation(
	db: Database,
	conversationId: string
) {
	const [currentConversation] = await db
		.select()
		.from(conversation)
		.where(eq(conversation.id, conversationId))
		.limit(1);

	return currentConversation ?? null;
}
