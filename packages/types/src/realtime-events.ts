import { z } from "zod";
import { MessageType, MessageVisibility } from "./enums";
import { conversationEventSchema, conversationSchema } from "./schemas";
import { conversationHeaderSchema } from "./trpc/conversation";

export const baseRealtimeEvent = z.object({
  websiteId: z.string(),
  organizationId: z.string(),
  visitorId: z.string().nullable(),
  userId: z.string().nullable(),
});

/**
 * Central event system for real-time communication
 * All WebSocket and Redis Pub/Sub events are defined here
 */
export const realtimeSchema = {
  userConnected: baseRealtimeEvent.extend({
    connectionId: z.string(),
  }),
  userDisconnected: baseRealtimeEvent.extend({
    connectionId: z.string(),
  }),
  visitorConnected: baseRealtimeEvent.extend({
    visitorId: z.string(),
    connectionId: z.string(),
  }),
  visitorDisconnected: baseRealtimeEvent.extend({
    visitorId: z.string(),
    connectionId: z.string(),
  }),
  userPresenceUpdate: baseRealtimeEvent.extend({
    userId: z.string(),
    status: z.enum(["online", "away", "offline"]),
    lastSeen: z.string(),
  }),
  conversationSeen: baseRealtimeEvent.extend({
    conversationId: z.string(),
    aiAgentId: z.string().nullable(),
    lastSeenAt: z.string(),
  }),
  conversationTyping: baseRealtimeEvent.extend({
    conversationId: z.string(),
    aiAgentId: z.string().nullable(),
    isTyping: z.boolean(),
    visitorPreview: z.string().max(2000).nullable().optional(),
  }),
  conversationEventCreated: baseRealtimeEvent.extend({
    conversationId: z.string(),
    aiAgentId: z.string().nullable(),
    event: conversationEventSchema,
  }),
  messageCreated: baseRealtimeEvent.extend({
    message: z.object({
      id: z.string(),
      bodyMd: z.string(),
      type: z.enum([MessageType.TEXT, MessageType.IMAGE, MessageType.FILE]),
      userId: z.string().nullable(),
      visitorId: z.string().nullable(),
      organizationId: z.string(),
      websiteId: z.string(),
      conversationId: z.string(),
      parentMessageId: z.string().nullable(),
      aiAgentId: z.string().nullable(),
      modelUsed: z.string().nullable(),
      visibility: z.enum([MessageVisibility.PUBLIC, MessageVisibility.PRIVATE]),
      createdAt: z.string(),
      updatedAt: z.string(),
      deletedAt: z.string().nullable(),
    }),
    conversationId: z.string(),
  }),
  conversationCreated: baseRealtimeEvent.extend({
    conversationId: z.string(),
    conversation: conversationSchema,
    header: conversationHeaderSchema,
  }),
} as const;

export type RealtimeEventType = keyof typeof realtimeSchema;

export type RealtimeEventPayload<T extends RealtimeEventType> = z.infer<
  (typeof realtimeSchema)[T]
>;

export type RealtimeEvent<T extends RealtimeEventType> = {
  type: T;
  payload: RealtimeEventPayload<T>;
};

export type AnyRealtimeEvent = {
  [K in RealtimeEventType]: RealtimeEvent<K>;
}[RealtimeEventType];

export type RealtimeEventData<T extends RealtimeEventType> =
  RealtimeEventPayload<T>;

/**
 * Validates an event against its schema
 */
export function validateRealtimeEvent<T extends RealtimeEventType>(
  type: T,
  data: unknown,
): RealtimeEventPayload<T> {
  const schema = realtimeSchema[type];
  return schema.parse(data) as RealtimeEventPayload<T>;
}

/**
 * Type guard to check if a string is a valid event type
 */
export function isValidEventType(type: unknown): type is RealtimeEventType {
  return typeof type === "string" && type in realtimeSchema;
}

export function getEventPayload<T extends RealtimeEventType>(
  event: RealtimeEvent<T>,
): RealtimeEventPayload<T> {
  return event.payload;
}
