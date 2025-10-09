import { z } from "zod";
import { conversationSchema } from "./schemas";
import { conversationHeaderSchema } from "./trpc/conversation";

const realtimeEventMetadataSchema = z.object({
	organizationId: z.string(),
	websiteId: z.string(),
	visitorId: z.string().nullable(),
});

/**
 * Central event system for real-time communication
 * All WebSocket and Redis Pub/Sub events are defined here
 */
export const RealtimeEvents = {
	USER_CONNECTED: realtimeEventMetadataSchema.merge(
		z.object({
			userId: z.string(),
			connectionId: z.string(),
			timestamp: z.number(),
		})
	),
	USER_DISCONNECTED: realtimeEventMetadataSchema.merge(
		z.object({
			userId: z.string(),
			connectionId: z.string(),
			timestamp: z.number(),
		})
	),
	VISITOR_CONNECTED: realtimeEventMetadataSchema.merge(
		z.object({
			visitorId: z.string(),
			connectionId: z.string(),
			timestamp: z.number(),
		})
	),
	VISITOR_DISCONNECTED: realtimeEventMetadataSchema.merge(
		z.object({
			visitorId: z.string(),
			connectionId: z.string(),
			timestamp: z.number(),
		})
	),
	USER_PRESENCE_UPDATE: realtimeEventMetadataSchema.merge(
		z.object({
			userId: z.string(),
			status: z.enum(["online", "away", "offline"]),
			lastSeen: z.number(),
		})
	),
	CONVERSATION_SEEN: realtimeEventMetadataSchema.merge(
		z.object({
			conversationId: z.string(),
			userId: z.string().nullable(),
			visitorId: z.string().nullable(),
			aiAgentId: z.string().nullable(),
			lastSeenAt: z.string(),
		})
	),
	CONVERSATION_TYPING: realtimeEventMetadataSchema.merge(
		z.object({
			conversationId: z.string(),
			userId: z.string().nullable(),
			visitorId: z.string().nullable(),
			aiAgentId: z.string().nullable(),
			isTyping: z.boolean(),
			visitorPreview: z.string().max(2000).nullable().optional(),
		})
	),
	CONVERSATION_EVENT_CREATED: realtimeEventMetadataSchema.merge(
		z.object({
			conversationId: z.string(),
			visitorId: z.string().nullable(),
			userId: z.string().nullable(),
			aiAgentId: z.string().nullable(),
			event: z.object({
				id: z.string(),
				conversationId: z.string(),
				organizationId: z.string(),
				type: z.string(),
				actorUserId: z.string().nullable(),
				actorAiAgentId: z.string().nullable(),
			}),
		})
	),
	MESSAGE_CREATED: realtimeEventMetadataSchema.merge(
		z.object({
			message: z.object({
				id: z.string(),
				bodyMd: z.string(),
				type: z.string(),
				userId: z.string().nullable(),
				visitorId: z.string().nullable(),
				organizationId: z.string(),
				websiteId: z.string(),
				conversationId: z.string(),
				parentMessageId: z.string().nullable(),
				aiAgentId: z.string().nullable(),
				modelUsed: z.string().nullable(),
				visibility: z.string(),
				createdAt: z.string(),
				updatedAt: z.string(),
				deletedAt: z.string().nullable(),
			}),
			conversationId: z.string(),
			visitorId: z.string().nullable(),
		})
	),
	CONVERSATION_CREATED: realtimeEventMetadataSchema.merge(
		z.object({
			conversationId: z.string(),
			visitorId: z.string().nullable(),
			conversation: conversationSchema,
			header: conversationHeaderSchema,
		})
	),
} as const;

export type RealtimeEventType = keyof typeof RealtimeEvents;

export type RealtimeEventPayload<T extends RealtimeEventType> = z.infer<
	(typeof RealtimeEvents)[T]
>;

export type RealtimeEvent<T extends RealtimeEventType = RealtimeEventType> = {
	type: T;
	payload: RealtimeEventPayload<T>;
	timestamp: number;
	organizationId: string;
	websiteId: string;
	visitorId: string | null;
};

export type RealtimeEventData<T extends RealtimeEventType> =
	RealtimeEventPayload<T>;

/**
 * Validates an event against its schema
 */
export function validateRealtimeEvent<T extends RealtimeEventType>(
	type: T,
	data: unknown
): RealtimeEventPayload<T> {
	const schema = RealtimeEvents[type];
	return schema.parse(data) as RealtimeEventPayload<T>;
}

/**
 * Type guard to check if a string is a valid event type
 */
export function isValidEventType(type: unknown): type is RealtimeEventType {
	return typeof type === "string" && type in RealtimeEvents;
}
