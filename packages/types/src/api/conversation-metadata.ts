import { z } from "@hono/zod-openapi";

/**
 * Conversation metadata are stored as flat key value pairs.
 * Values can be strings, numbers, booleans, or null.
 */
export const conversationMetadataSchema = z
	.record(z.string(), z.string().or(z.number()).or(z.boolean()).or(z.null()))
	.openapi({
		description: "Public conversation metadata stored as flat key-value pairs.",
		example: { orderId: "ord_123", priority: "vip", mrr: 299 },
	});

export type ConversationMetadata = z.infer<typeof conversationMetadataSchema>;
