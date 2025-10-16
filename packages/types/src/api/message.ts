import { z } from "@hono/zod-openapi";
import { MessageType, MessageVisibility } from "../enums";

export const messageSchemaResponse = z
	.object({
		id: z.string().openapi({
			description: "The unique identifier for the message",
		}),
		bodyMd: z.string().openapi({
			description: "The message content in markdown format",
		}),
		type: z
			.enum([MessageType.TEXT, MessageType.IMAGE, MessageType.FILE])
			.openapi({
				description: "The type of message",
			}),
		userId: z.string().nullable().openapi({
			description: "The ID of the user who sent the message, if applicable",
		}),
		aiAgentId: z.string().nullable().openapi({
			description: "The ID of the AI agent who sent the message, if applicable",
		}),
		parentMessageId: z.string().nullable().openapi({
			description: "The ID of the parent message, if this is a reply",
		}),
		modelUsed: z.string().nullable().openapi({
			description: "The AI model used to generate the message, if applicable",
		}),
		visitorId: z.string().nullable().openapi({
			description: "The ID of the visitor who sent the message, if applicable",
		}),
		conversationId: z.string().openapi({
			description: "The ID of the conversation this message belongs to",
		}),
		createdAt: z.string().openapi({
			description: "When the message was created",
		}),
		updatedAt: z.string().openapi({
			description: "When the message was last updated",
		}),
		deletedAt: z.string().nullable().openapi({
			description: "When the message was deleted, if applicable",
		}),
		visibility: z
			.enum([MessageVisibility.PUBLIC, MessageVisibility.PRIVATE])
			.openapi({
				description: "The visibility level of the message",
			}),
	})
	.openapi({
		description: "Message object with all fields",
	});

export const getMessagesRequestSchema = z
	.object({
		conversationId: z.string().min(1).openapi({
			description: "The ID of the conversation to retrieve messages from",
		}),
		limit: z.coerce.number().min(1).max(100).optional().default(50).openapi({
			description: "Maximum number of messages to return",
			default: 50,
		}),
		cursor: z.string().optional().openapi({
			description: "Cursor for pagination",
		}),
	})
	.openapi({
		description: "Query parameters for retrieving messages",
	});

export type GetMessagesRequest = z.infer<typeof getMessagesRequestSchema>;

export const getMessagesResponseSchema = z
	.object({
		messages: z.array(messageSchemaResponse).openapi({
			description: "Array of messages in the conversation",
		}),
		nextCursor: z.string().optional().openapi({
			description: "Cursor for the next page of messages, if available",
		}),
		hasNextPage: z.boolean().openapi({
			description: "Whether there are more messages to fetch",
		}),
	})
	.openapi({
		description: "Response containing paginated messages",
	});

export type GetMessagesResponse = z.infer<typeof getMessagesResponseSchema>;

export const sendMessageRequestSchema = z
	.object({
		conversationId: z.string().min(1).openapi({
			description: "The ID of the conversation to send the message to",
		}),
		message: z
			.object({
				id: z.string().optional().openapi({
					description:
						"Optional custom ID for the message. If not provided, an ID will be generated automatically",
				}),
				bodyMd: z.string().openapi({
					description: "The message content in markdown format",
				}),
				type: z.enum(["text", "image", "file"]).default("text").openapi({
					description: "The type of message",
					default: "text",
				}),
				userId: z.string().nullable().optional().openapi({
					description: "The ID of the user sending the message, if applicable",
				}),
				visitorId: z.string().nullable().optional().openapi({
					description:
						"The ID of the visitor sending the message, if applicable",
				}),
				aiAgentId: z.string().nullable().optional().openapi({
					description:
						"The ID of the AI agent sending the message, if applicable",
				}),
				visibility: z.enum(["public", "private"]).default("public").openapi({
					description: "The visibility level of the message",
					default: "public",
				}),
				createdAt: z.string().optional().openapi({
					description:
						"Optional timestamp for when the message was created. If not provided, the current time will be used",
				}),
			})
			.openapi({
				description: "The message data to send",
			}),
	})
	.openapi({
		description: "Body for sending a new message",
	});

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const sendMessageResponseSchema = z
	.object({
		message: messageSchemaResponse.openapi({
			description: "The created message object",
		}),
	})
	.openapi({
		description: "Response containing the sent message",
	});

export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;
