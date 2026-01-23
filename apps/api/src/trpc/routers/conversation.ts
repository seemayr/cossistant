import {
	archiveConversation,
	type ConversationRecord,
	joinEscalation,
	markConversationAsNotSpam,
	markConversationAsRead,
	markConversationAsSpam,
	markConversationAsUnread,
	reopenConversation,
	resolveConversation,
	unarchiveConversation,
} from "@api/db/mutations/conversation";
import {
	getConversationById,
	getConversationTimelineItems,
	listConversationsHeaders,
} from "@api/db/queries/conversation";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { createParticipantJoinedEvent } from "@api/utils/conversation-events";
import {
	emitConversationSeenEvent,
	emitConversationTypingEvent,
} from "@api/utils/conversation-realtime";
import {
	addConversationParticipant,
	isUserParticipant,
} from "@api/utils/participant-helpers";
import { createMessageTimelineItem } from "@api/utils/timeline-item";
import {
	type ContactMetadata,
	conversationMutationResponseSchema,
	listConversationHeadersResponseSchema,
	visitorResponseSchema,
} from "@cossistant/types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { loadConversationContext } from "../utils/conversation";

function toConversationOutput(record: ConversationRecord) {
	return {
		...record,
	};
}

export const conversationRouter = createTRPCRouter({
	listConversationsHeaders: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				limit: z.number().int().min(1).max(500).optional(),
				cursor: z.string().nullable().optional(),
			})
		)
		.output(listConversationHeadersResponseSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			// Fetch conversations for the website
			const result = await listConversationsHeaders(db, {
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				userId: user.id,
				limit: input.limit,
				cursor: input.cursor,
			});

			return {
				items: result.items,
				nextCursor: result.nextCursor,
			};
		}),

	getConversationTimelineItems: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
				limit: z.number().int().min(1).max(100).optional().default(50),
				cursor: z.union([z.string(), z.date()]).nullable().optional(),
			})
		)
		.query(async ({ ctx: { db, user }, input }) => {
			// Query website access and conversation in parallel
			const [websiteData, conversation] = await Promise.all([
				getWebsiteBySlugWithAccess(db, {
					userId: user.id,
					websiteSlug: input.websiteSlug,
				}),
				getConversationById(db, {
					conversationId: input.conversationId,
				}),
			]);

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			if (!conversation || conversation.websiteId !== websiteData.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Conversation not found",
				});
			}

			// Get timeline items
			const result = await getConversationTimelineItems(db, {
				organizationId: websiteData.organizationId,
				conversationId: input.conversationId,
				websiteId: websiteData.id,
				limit: input.limit,
				cursor: input.cursor,
			});

			return {
				items: result.items.map((item) => ({
					id: item.id,
					conversationId: item.conversationId,
					organizationId: item.organizationId,
					visibility: item.visibility,
					type: item.type,
					text: item.text,
					parts: item.parts as unknown[],
					userId: item.userId,
					visitorId: item.visitorId,
					aiAgentId: item.aiAgentId,
					createdAt: item.createdAt,
					deletedAt: item.deletedAt,
				})),
				nextCursor: result.nextCursor ?? null,
				hasNextPage: result.hasNextPage,
			};
		}),

	sendMessage: protectedProcedure
		.input(
			z
				.object({
					conversationId: z.string(),
					websiteSlug: z.string(),
					text: z.string(),
					visibility: z.enum(["public", "private"]).default("public"),
					timelineItemId: z.ulid().optional(),
					// Optional file/image parts to include in the message
					parts: z
						.array(
							z.union([
								z.object({
									type: z.literal("image"),
									url: z.url(),
									mediaType: z.string(),
									fileName: z.string().optional(),
									size: z.number().optional(),
									width: z.number().optional(),
									height: z.number().optional(),
								}),
								z.object({
									type: z.literal("file"),
									url: z.url(),
									mediaType: z.string(),
									fileName: z.string().optional(),
									size: z.number().optional(),
								}),
							])
						)
						.optional(),
				})
				.refine(
					(data) => {
						const hasText = data.text.trim().length > 0;
						const hasParts = data.parts && data.parts.length > 0;
						return hasText || hasParts;
					},
					{
						message:
							"Message must have either text content or file attachments",
						path: ["text"],
					}
				)
		)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const [websiteData, conversation] = await Promise.all([
				getWebsiteBySlugWithAccess(db, {
					userId: user.id,
					websiteSlug: input.websiteSlug,
				}),
				getConversationById(db, {
					conversationId: input.conversationId,
				}),
			]);

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			if (!conversation || conversation.websiteId !== websiteData.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Conversation not found",
				});
			}

			// Check if user needs to be added as participant
			const isParticipant = await isUserParticipant(db, {
				conversationId: input.conversationId,
				userId: user.id,
			});

			if (!isParticipant) {
				// Add user as participant
				await addConversationParticipant(db, {
					conversationId: input.conversationId,
					userId: user.id,
					organizationId: websiteData.organizationId,
					reason: "Sent message",
				});

				// Create participant joined event
				await createParticipantJoinedEvent(db, {
					conversationId: input.conversationId,
					organizationId: websiteData.organizationId,
					targetUserId: user.id,
					isAutoAdded: true,
				});
			}

			const { item: createdTimelineItem } = await createMessageTimelineItem({
				db,
				organizationId: websiteData.organizationId,
				websiteId: websiteData.id,
				conversationId: input.conversationId,
				conversationOwnerVisitorId: conversation.visitorId,
				id: input.timelineItemId,
				text: input.text,
				extraParts: input.parts ?? [],
				visibility: input.visibility,
				userId: user.id,
				visitorId: null,
				aiAgentId: null,
			});

			// Mark conversation as read by user after sending timeline item
			const { lastSeenAt } = await markConversationAsRead(db, {
				conversation,
				actorUserId: user.id,
			});

			await emitConversationSeenEvent({
				conversation,
				actor: { type: "user", userId: user.id },
				lastSeenAt,
			});

			return { item: createdTimelineItem };
		}),

	markResolved: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await resolveConversation(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to resolve conversation",
				});
			}

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markOpen: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await reopenConversation(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to reopen conversation",
				});
			}

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markSpam: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await markConversationAsSpam(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to mark conversation as spam",
				});
			}

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markNotSpam: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await markConversationAsNotSpam(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to mark conversation as not spam",
				});
			}

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markArchived: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await archiveConversation(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to archive conversation",
				});
			}

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markUnarchived: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await unarchiveConversation(db, {
				conversation,
				actorUserId: user.id,
			});

			if (!updatedConversation) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to unarchive conversation",
				});
			}

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markRead: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const { conversation: updatedConversation, lastSeenAt } =
				await markConversationAsRead(db, {
					conversation,
					actorUserId: user.id,
				});

			await emitConversationSeenEvent({
				conversation: updatedConversation,
				actor: { type: "user", userId: user.id },
				lastSeenAt,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	markUnread: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(
				db,
				user.id,
				input
			);
			const updatedConversation = await markConversationAsUnread(db, {
				conversation,
				actorUserId: user.id,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	joinEscalation: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(conversationMutationResponseSchema)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation, website } = await loadConversationContext(
				db,
				user.id,
				input
			);

			// Check if user is already a participant
			const isParticipant = await isUserParticipant(db, {
				conversationId: input.conversationId,
				userId: user.id,
			});

			if (!isParticipant) {
				// Add user as participant
				await addConversationParticipant(db, {
					conversationId: input.conversationId,
					userId: user.id,
					organizationId: website.organizationId,
					reason: "Joined escalation",
				});

				// Create participant joined event (PUBLIC so visitor sees it)
				await createParticipantJoinedEvent(db, {
					conversationId: input.conversationId,
					organizationId: website.organizationId,
					targetUserId: user.id,
					isAutoAdded: false,
				});
			}

			// Mark escalation as handled
			const updatedConversation = await joinEscalation(db, {
				conversation,
				actorUserId: user.id,
			});

			return { conversation: toConversationOutput(updatedConversation) };
		}),

	setTyping: protectedProcedure
		.input(
			z.object({
				conversationId: z.string(),
				websiteSlug: z.string(),
				isTyping: z.boolean(),
			})
		)
		.output(
			z.object({
				success: z.literal(true),
			})
		)
		.mutation(async ({ ctx: { db, user }, input }) => {
			const { conversation } = await loadConversationContext(db, user.id, {
				websiteSlug: input.websiteSlug,
				conversationId: input.conversationId,
			});

			await emitConversationTypingEvent({
				conversation,
				actor: { type: "user", userId: user.id },
				isTyping: input.isTyping,
			});

			return { success: true } as const;
		}),

	getVisitorById: protectedProcedure
		.input(
			z.object({
				visitorId: z.string(),
				websiteSlug: z.string(),
			})
		)
		.output(visitorResponseSchema.nullable())
		.query(async ({ ctx: { db, user }, input }) => {
			// Query website access and visitor in parallel
			const [websiteData, visitor] = await Promise.all([
				getWebsiteBySlugWithAccess(db, {
					userId: user.id,
					websiteSlug: input.websiteSlug,
				}),
				getCompleteVisitorWithContact(db, {
					visitorId: input.visitorId,
				}),
			]);

			if (!websiteData) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			if (!visitor || visitor.websiteId !== websiteData.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Visitor not found",
				});
			}

			return {
				...visitor,
				contact: visitor.contact
					? {
							...visitor.contact,
							metadata: visitor.contact.metadata as ContactMetadata,
						}
					: null,
				isBlocked: Boolean(visitor.blockedAt),
			};
		}),
});
