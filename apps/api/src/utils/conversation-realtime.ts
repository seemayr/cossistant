import type { ConversationRecord } from "@api/db/mutations/conversation";
import type { conversationEvent } from "@api/db/schema";
import { realtime } from "@api/realtime/emitter";
import type { ConversationHeader } from "@cossistant/types/trpc/conversation";
import type { InferSelectModel } from "drizzle-orm";

type ConversationEventRecord = InferSelectModel<typeof conversationEvent>;

export type ConversationRealtimeActor =
  | { type: "visitor"; visitorId: string }
  | { type: "user"; userId: string }
  | { type: "ai_agent"; aiAgentId: string };

type BaseRealtimeContext = {
  conversation: ConversationRecord;
};

type SeenEventParams = BaseRealtimeContext & {
  actor: ConversationRealtimeActor;
  lastSeenAt: string;
};

type TypingEventParams = BaseRealtimeContext & {
  actor: ConversationRealtimeActor;
  isTyping: boolean;
  visitorPreview?: string | null;
};

type TimelineEventParams = BaseRealtimeContext & {
  event: ConversationEventRecord;
};

type ConversationCreatedEventParams = {
  conversation: ConversationRecord;
  header: ConversationHeader;
};

function mapActor(actor: ConversationRealtimeActor) {
  switch (actor.type) {
    case "visitor":
      return {
        actorType: "visitor" as const,
        actorId: actor.visitorId,
        visitorId: actor.visitorId,
        userId: null,
        aiAgentId: null,
      };
    case "user":
      return {
        actorType: "user" as const,
        actorId: actor.userId,
        visitorId: null,
        userId: actor.userId,
        aiAgentId: null,
      };
    case "ai_agent":
      return {
        actorType: "ai_agent" as const,
        actorId: actor.aiAgentId,
        visitorId: null,
        userId: null,
        aiAgentId: actor.aiAgentId,
      };
    default:
      throw new Error("Unknown actor type");
  }
}

export async function emitConversationSeenEvent({
  conversation,
  actor,
  lastSeenAt,
}: SeenEventParams) {
  const actorPayload = mapActor(actor);

  await realtime.emit("conversationSeen", {
    conversationId: conversation.id,
    organizationId: conversation.organizationId,
    websiteId: conversation.websiteId,
    lastSeenAt,
    ...actorPayload,
    visitorId: actorPayload.visitorId ?? conversation.visitorId ?? null,
  });
}

export async function emitConversationTypingEvent({
  conversation,
  actor,
  isTyping,
  visitorPreview,
}: TypingEventParams) {
  const actorPayload = mapActor(actor);
  const previewForEvent =
    actor.type === "visitor" && isTyping && visitorPreview
      ? visitorPreview.slice(0, 2000)
      : null;

  await realtime.emit("conversationTyping", {
    conversationId: conversation.id,
    websiteId: conversation.websiteId,
    organizationId: conversation.organizationId,
    isTyping,
    visitorPreview: previewForEvent,
    ...actorPayload,
    visitorId: actorPayload.visitorId ?? conversation.visitorId ?? null,
  });
}

export async function emitConversationCreatedEvent({
  conversation,
  header,
}: ConversationCreatedEventParams) {
  await realtime.emit("conversationCreated", {
    conversationId: conversation.id,
    websiteId: conversation.websiteId,
    organizationId: conversation.organizationId,
    visitorId: conversation.visitorId ?? null,
    userId: null,
    conversation: {
      id: conversation.id,
      title: conversation.title ?? undefined,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      visitorId: conversation.visitorId,
      websiteId: conversation.websiteId,
      status: conversation.status,
      lastMessage: header.lastMessagePreview ?? undefined,
    },
    header,
  });
}

export async function emitConversationEventCreated({
  conversation,
  event,
}: TimelineEventParams) {
  const metadata = event.metadata
    ? (event.metadata as Record<string, unknown>)
    : undefined;

  await realtime.emit("conversationEventCreated", {
    conversationId: conversation.id,
    websiteId: conversation.websiteId,
    organizationId: conversation.organizationId,
    visitorId: conversation.visitorId ?? null,
    userId: event.actorUserId ?? null,
    aiAgentId: event.actorAiAgentId ?? null,
    event: {
      id: event.id,
      conversationId: event.conversationId,
      organizationId: event.organizationId,
      type: event.type,
      actorUserId: event.actorUserId,
      actorAiAgentId: event.actorAiAgentId,
      targetUserId: event.targetUserId,
      targetAiAgentId: event.targetAiAgentId,
      metadata,
      message: event.message ?? undefined,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
      deletedAt: null,
    },
  });
}
