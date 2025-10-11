import type { Database } from "@api/db";
import { conversation, conversationSeen } from "@api/db/schema";
import { generateULID } from "@api/utils/db/ids";
import { createConversationEvent } from "@api/utils/conversation-event";
import { ConversationEventType, ConversationStatus } from "@cossistant/types";
import type { InferSelectModel } from "drizzle-orm";
import { and, eq } from "drizzle-orm";

export type ConversationRecord = InferSelectModel<typeof conversation>;

function computeResolutionTime(
  conversationRecord: ConversationRecord,
  resolvedAt: string,
): number | null {
  if (!conversationRecord.startedAt) {
    return conversationRecord.resolutionTime ?? null;
  }

  const durationMs =
    new Date(resolvedAt).getTime() -
    new Date(conversationRecord.startedAt).getTime();
  return durationMs > 0 ? Math.round(durationMs / 1000) : 0;
}

export async function resolveConversation(
  db: Database,
  params: {
    conversation: ConversationRecord;
    actorUserId: string;
  },
) {
  const resolvedAt = new Date().toISOString();

  const [updated] = await db
    .update(conversation)
    .set({
      status: ConversationStatus.RESOLVED,
      resolvedAt,
      resolvedByUserId: params.actorUserId,
      resolvedByAiAgentId: null,
      resolutionTime: computeResolutionTime(params.conversation, resolvedAt),
      updatedAt: resolvedAt,
    })
    .where(
      and(
        eq(conversation.id, params.conversation.id),
        eq(conversation.organizationId, params.conversation.organizationId),
        eq(conversation.websiteId, params.conversation.websiteId),
      ),
    )
    .returning();

  if (!updated) {
    return null;
  }

  await createConversationEvent({
    db,
    conversation: params.conversation,
    event: {
      type: ConversationEventType.RESOLVED,
      actorUserId: params.actorUserId,
      createdAt: resolvedAt,
    },
  });

  return updated;
}

export async function reopenConversation(
  db: Database,
  params: {
    conversation: ConversationRecord;
    actorUserId: string;
  },
) {
  const reopenedAt = new Date().toISOString();

  const [updated] = await db
    .update(conversation)
    .set({
      status: ConversationStatus.OPEN,
      resolvedAt: null,
      resolvedByUserId: null,
      resolvedByAiAgentId: null,
      resolutionTime: null,
      updatedAt: reopenedAt,
    })
    .where(
      and(
        eq(conversation.id, params.conversation.id),
        eq(conversation.organizationId, params.conversation.organizationId),
        eq(conversation.websiteId, params.conversation.websiteId),
      ),
    )
    .returning();

  if (!updated) {
    return null;
  }

  await createConversationEvent({
    db,
    conversation: params.conversation,
    event: {
      type: ConversationEventType.REOPENED,
      actorUserId: params.actorUserId,
      createdAt: reopenedAt,
    },
  });

  return updated;
}

export async function markConversationAsSpam(
  db: Database,
  params: {
    conversation: ConversationRecord;
    actorUserId: string;
  },
) {
  const updatedAt = new Date().toISOString();

  const [updated] = await db
    .update(conversation)
    .set({
      status: ConversationStatus.SPAM,
      resolvedAt: null,
      resolvedByUserId: null,
      resolvedByAiAgentId: null,
      updatedAt,
    })
    .where(
      and(
        eq(conversation.id, params.conversation.id),
        eq(conversation.organizationId, params.conversation.organizationId),
        eq(conversation.websiteId, params.conversation.websiteId),
      ),
    )
    .returning();

  if (!updated) {
    return null;
  }

  await createConversationEvent({
    db,
    conversation: params.conversation,
    event: {
      type: ConversationEventType.STATUS_CHANGED,
      actorUserId: params.actorUserId,
      metadata: {
        previousStatus: params.conversation.status,
        newStatus: ConversationStatus.SPAM,
      },
      createdAt: updatedAt,
    },
  });

  return updated;
}

export async function markConversationAsNotSpam(
  db: Database,
  params: {
    conversation: ConversationRecord;
    actorUserId: string;
  },
) {
  const updatedAt = new Date().toISOString();

  const [updated] = await db
    .update(conversation)
    .set({
      status: ConversationStatus.OPEN,
      resolvedAt: null,
      resolvedByUserId: null,
      resolvedByAiAgentId: null,
      resolutionTime: null,
      updatedAt,
    })
    .where(
      and(
        eq(conversation.id, params.conversation.id),
        eq(conversation.organizationId, params.conversation.organizationId),
        eq(conversation.websiteId, params.conversation.websiteId),
      ),
    )
    .returning();

  if (!updated) {
    return null;
  }

  await createConversationEvent({
    db,
    conversation: params.conversation,
    event: {
      type: ConversationEventType.STATUS_CHANGED,
      actorUserId: params.actorUserId,
      metadata: {
        previousStatus: params.conversation.status,
        newStatus: ConversationStatus.OPEN,
      },
      createdAt: updatedAt,
    },
  });

  return updated;
}

export async function archiveConversation(
  db: Database,
  params: {
    conversation: ConversationRecord;
    actorUserId: string;
  },
) {
  const archivedAt = new Date().toISOString();

  const [updated] = await db
    .update(conversation)
    .set({
      deletedAt: archivedAt,
      updatedAt: archivedAt,
    })
    .where(
      and(
        eq(conversation.id, params.conversation.id),
        eq(conversation.organizationId, params.conversation.organizationId),
        eq(conversation.websiteId, params.conversation.websiteId),
      ),
    )
    .returning();

  if (!updated) {
    return null;
  }

  await createConversationEvent({
    db,
    conversation: params.conversation,
    event: {
      type: ConversationEventType.STATUS_CHANGED,
      actorUserId: params.actorUserId,
      metadata: { archived: true },
      createdAt: archivedAt,
    },
  });

  return updated;
}

export async function unarchiveConversation(
  db: Database,
  params: {
    conversation: ConversationRecord;
    actorUserId: string;
  },
) {
  const unarchivedAt = new Date().toISOString();

  const [updated] = await db
    .update(conversation)
    .set({
      deletedAt: null,
      updatedAt: unarchivedAt,
    })
    .where(
      and(
        eq(conversation.id, params.conversation.id),
        eq(conversation.organizationId, params.conversation.organizationId),
        eq(conversation.websiteId, params.conversation.websiteId),
      ),
    )
    .returning();

  if (!updated) {
    return null;
  }

  await createConversationEvent({
    db,
    conversation: params.conversation,
    event: {
      type: ConversationEventType.STATUS_CHANGED,
      actorUserId: params.actorUserId,
      metadata: { archived: false },
      createdAt: unarchivedAt,
    },
  });

  return updated;
}

export async function markConversationAsRead(
  db: Database,
  params: {
    conversation: ConversationRecord;
    actorUserId: string;
  },
): Promise<{ conversation: ConversationRecord; lastSeenAt: string }> {
  const lastSeenAt = new Date().toISOString();

  await db
    .insert(conversationSeen)
    .values({
      id: generateULID(),
      conversationId: params.conversation.id,
      organizationId: params.conversation.organizationId,
      userId: params.actorUserId,
      visitorId: null,
      aiAgentId: null,
      lastSeenAt,
      createdAt: lastSeenAt,
      updatedAt: lastSeenAt,
    })
    .onConflictDoUpdate({
      target: [conversationSeen.conversationId, conversationSeen.userId],
      set: {
        lastSeenAt,
        updatedAt: lastSeenAt,
      },
    });

  return {
    conversation: params.conversation,
    lastSeenAt,
  };
}

export async function markConversationAsSeenByVisitor(
  db: Database,
  params: {
    conversation: ConversationRecord;
    visitorId: string;
  },
) {
  const updatedAt = new Date().toISOString();

  await db
    .insert(conversationSeen)
    .values({
      id: generateULID(),
      conversationId: params.conversation.id,
      organizationId: params.conversation.organizationId,
      userId: null,
      visitorId: params.visitorId,
      aiAgentId: null,
      lastSeenAt: updatedAt,
      createdAt: updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [conversationSeen.conversationId, conversationSeen.visitorId],
      set: {
        lastSeenAt: updatedAt,
        updatedAt,
      },
    });

  return updatedAt;
}

export async function markConversationAsUnread(
  db: Database,
  params: {
    conversation: ConversationRecord;
    actorUserId: string;
  },
) {
  await db
    .delete(conversationSeen)
    .where(
      and(
        eq(conversationSeen.conversationId, params.conversation.id),
        eq(conversationSeen.userId, params.actorUserId),
      ),
    );

  return params.conversation;
}
