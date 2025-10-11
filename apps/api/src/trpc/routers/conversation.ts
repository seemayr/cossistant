import {
  archiveConversation,
  type ConversationRecord,
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
  getConversationEvents,
  listConversationsHeaders,
} from "@api/db/queries/conversation";
import { getConversationMessages } from "@api/db/queries/message";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import {
  emitConversationSeenEvent,
  emitConversationTypingEvent,
} from "@api/utils/conversation-realtime";
import { createMessage } from "@api/utils/message";
import {
  type ContactMetadata,
  conversationEventSchema,
  conversationMutationResponseSchema,
  listConversationHeadersResponseSchema,
  MessageType,
  MessageVisibility,
  messageSchema,
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
      }),
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

  getConversationMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        websiteSlug: z.string(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: z.union([z.string(), z.date()]).nullable().optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(messageSchema),
        nextCursor: z.string().nullable(),
        hasNextPage: z.boolean(),
      }),
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

      // Get messages
      const result = await getConversationMessages(db, {
        conversationId: input.conversationId,
        websiteId: websiteData.id,
        limit: input.limit,
        cursor: input.cursor,
      });

      return {
        items: result.messages,
        nextCursor: result.nextCursor,
        hasNextPage: result.hasNextPage,
      };
    }),

  getConversationEvents: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        websiteSlug: z.string(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: z.union([z.string(), z.date()]).nullable().optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(conversationEventSchema),
        nextCursor: z.string().nullable(),
        hasNextPage: z.boolean(),
      }),
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

      // Get events
      const result = await getConversationEvents(db, {
        organizationId: websiteData.organizationId,
        conversationId: input.conversationId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return {
        items: result.events.map((event) => ({
          ...event,
          metadata: event.metadata
            ? (event.metadata as Record<string, unknown>)
            : undefined,
          updatedAt: event.createdAt,
          deletedAt: null,
          message: event.message ?? undefined,
        })),
        nextCursor: result.nextCursor,
        hasNextPage: result.hasNextPage,
      };
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        websiteSlug: z.string(),
        bodyMd: z.string().min(1),
        type: z
          .enum([MessageType.TEXT, MessageType.IMAGE, MessageType.FILE])
          .default(MessageType.TEXT),
        visibility: z
          .enum([MessageVisibility.PUBLIC, MessageVisibility.PRIVATE])
          .default(MessageVisibility.PUBLIC),
      }),
    )
    .output(z.object({ message: messageSchema }))
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

      const createdMessage = await createMessage({
        db,
        organizationId: websiteData.organizationId,
        websiteId: websiteData.id,
        conversationId: input.conversationId,
        conversationOwnerVisitorId: conversation.visitorId,
        message: {
          bodyMd: input.bodyMd,
          type: input.type,
          visibility: input.visibility,
          userId: user.id,
          visitorId: null,
          aiAgentId: null,
        },
      });

      // Mark conversation as read by user after sending message
      const { lastSeenAt } = await markConversationAsRead(db, {
        conversation,
        actorUserId: user.id,
      });

      await emitConversationSeenEvent({
        conversation,
        actor: { type: "user", userId: user.id },
        lastSeenAt,
      });

      return { message: createdMessage };
    }),

  markResolved: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        websiteSlug: z.string(),
      }),
    )
    .output(conversationMutationResponseSchema)
    .mutation(async ({ ctx: { db, user }, input }) => {
      const { conversation } = await loadConversationContext(
        db,
        user.id,
        input,
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
      }),
    )
    .output(conversationMutationResponseSchema)
    .mutation(async ({ ctx: { db, user }, input }) => {
      const { conversation } = await loadConversationContext(
        db,
        user.id,
        input,
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
      }),
    )
    .output(conversationMutationResponseSchema)
    .mutation(async ({ ctx: { db, user }, input }) => {
      const { conversation } = await loadConversationContext(
        db,
        user.id,
        input,
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
      }),
    )
    .output(conversationMutationResponseSchema)
    .mutation(async ({ ctx: { db, user }, input }) => {
      const { conversation } = await loadConversationContext(
        db,
        user.id,
        input,
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
      }),
    )
    .output(conversationMutationResponseSchema)
    .mutation(async ({ ctx: { db, user }, input }) => {
      const { conversation } = await loadConversationContext(
        db,
        user.id,
        input,
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
      }),
    )
    .output(conversationMutationResponseSchema)
    .mutation(async ({ ctx: { db, user }, input }) => {
      const { conversation } = await loadConversationContext(
        db,
        user.id,
        input,
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
      }),
    )
    .output(conversationMutationResponseSchema)
    .mutation(async ({ ctx: { db, user }, input }) => {
      const { conversation } = await loadConversationContext(
        db,
        user.id,
        input,
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
      }),
    )
    .output(conversationMutationResponseSchema)
    .mutation(async ({ ctx: { db, user }, input }) => {
      const { conversation } = await loadConversationContext(
        db,
        user.id,
        input,
      );
      const updatedConversation = await markConversationAsUnread(db, {
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
      }),
    )
    .output(
      z.object({
        success: z.literal(true),
      }),
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
      }),
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
