import type { ConversationRecord } from "@api/db/mutations/conversation";
import type { Database } from "@api/db";
import { conversationEvent } from "@api/db/schema";
import { generateULID } from "@api/utils/db/ids";
import { emitConversationEventCreated } from "@api/utils/conversation-realtime";
import type { ConversationEventType } from "@cossistant/types";
import type { InferSelectModel } from "drizzle-orm";

export type ConversationEventRecord = InferSelectModel<
  typeof conversationEvent
>;

type CreateConversationEventInput = {
  db: Database;
  conversation: ConversationRecord;
  event: {
    type: ConversationEventType;
    actorUserId?: string | null;
    actorAiAgentId?: string | null;
    targetUserId?: string | null;
    targetAiAgentId?: string | null;
    metadata?: Record<string, unknown> | null;
    message?: string | null;
    createdAt?: string;
  };
};

export async function createConversationEvent({
  db,
  conversation,
  event,
}: CreateConversationEventInput): Promise<ConversationEventRecord> {
  const createdAt = event.createdAt ?? new Date().toISOString();

  const [created] = await db
    .insert(conversationEvent)
    .values({
      id: generateULID(),
      organizationId: conversation.organizationId,
      conversationId: conversation.id,
      type: event.type,
      actorUserId: event.actorUserId ?? null,
      actorAiAgentId: event.actorAiAgentId ?? null,
      targetUserId: event.targetUserId ?? null,
      targetAiAgentId: event.targetAiAgentId ?? null,
      metadata: event.metadata ?? null,
      message: event.message ?? null,
      createdAt,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create conversation event");
  }

  await emitConversationEventCreated({
    conversation,
    event: created,
  });

  return created;
}
