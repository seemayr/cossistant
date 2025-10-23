import {
	type ConversationActor,
	markConversationAsSeen,
} from "@api/db/mutations/conversation";
import { getConversationById } from "@api/db/queries/conversation";
import { markUserPresence, markVisitorPresence } from "@api/services/presence";
import { emitConversationSeenEvent } from "@api/utils/conversation-realtime";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import {
	sendTimelineItemRequestSchema,
	sendTimelineItemResponseSchema,
	type TimelineItem,
} from "@cossistant/types/api/timeline-item";
import {
	ConversationStatus,
	ConversationTimelineType,
} from "@cossistant/types/enums";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import type { RestContext } from "../types";

export const messagesRouter = new OpenAPIHono<RestContext>();

const VISITOR_MESSAGE_ALLOWED_STATUSES = new Set([ConversationStatus.OPEN]);

// Apply middleware to all routes in this router
messagesRouter.use("/*", ...protectedPublicApiKeyMiddleware);

// GET /messages endpoint removed - use /conversations/:id/timeline instead

messagesRouter.openapi(
	{
		method: "post",
		path: "/",
		summary: "Send a message (timeline item) to a conversation",
		description:
			"Send a new message (timeline item) to an existing conversation.",
		tags: ["Messages", "Timeline item"],
		request: {
			body: {
				required: true,
				content: {
					"application/json": {
						schema: sendTimelineItemRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Timeline item sent successfully",
				content: {
					"application/json": {
						schema: sendTimelineItemResponseSchema,
					},
				},
			},
			400: {
				description: "Invalid request",
				content: {
					"application/json": {
						schema: z.object({ error: z.string() }),
					},
				},
			},
		},
		security: [
			{
				"Public API Key": [],
			},
			{
				"Private API Key": [],
			},
		],
		parameters: [
			{
				name: "Authorization",
				in: "header",
				description:
					"Private API key in Bearer token format. Use this for server-to-server authentication. Format: `Bearer sk_[live|test]_...`",
				required: false,
				schema: {
					type: "string",
					pattern: "^Bearer sk_(live|test)_[a-f0-9]{64}$",
					example: "Bearer sk_test_xxx",
				},
			},
			{
				name: "X-Public-Key",
				in: "header",
				description:
					"Public API key for browser-based authentication. Can only be used from whitelisted domains. Format: `pk_[live|test]_...`",
				required: false,
				schema: {
					type: "string",
					pattern: "^pk_(live|test)_[a-f0-9]{64}$",
					example: "pk_test_xxx",
				},
			},
			{
				name: "X-Visitor-Id",
				in: "header",
				description: "Visitor ID from localStorage.",
				required: false,
				schema: {
					type: "string",
					pattern: "^[0-9A-HJKMNP-TV-Z]{26}$",
					example: "01JG000000000000000000000",
				},
			},
		],
	},
	async (c) => {
		const { db, website, organization, body, visitorIdHeader, apiKey } =
			await safelyExtractRequestData(c, sendTimelineItemRequestSchema);

		const visitorId = body.item.visitorId || visitorIdHeader || null;

		const conversation = await getConversationById(db, {
			conversationId: body.conversationId,
		});

		if (!conversation || conversation.websiteId !== website.id) {
			return c.json(
				validateResponse(
					{ error: "Conversation for website not found" },
					z.object({ error: z.string() })
				),
				404
			);
		}

		// With a public key,
		const isPublic = apiKey?.keyType === "public";

		// Visitor must own the conversation when using the public key
		if (isPublic && conversation.visitorId !== visitorId) {
			return c.json(
				validateResponse(
					{ error: "Forbidden: visitor does not own the conversation" },
					z.object({ error: z.string() })
				),
				403
			);
		}

		if (
			isPublic &&
			!VISITOR_MESSAGE_ALLOWED_STATUSES.has(conversation.status)
		) {
			return c.json(
				validateResponse(
					{
						error:
							"Forbidden: visitor cannot reply to this conversation status",
					},
					z.object({ error: z.string() })
				),
				403
			);
		}

		// Disallow setting user/ai actor via public key
		if (isPublic && (body.item.userId || body.item.aiAgentId)) {
			return c.json(
				validateResponse(
					{
						error:
							"Forbidden: cannot set userId/aiAgentId with a public API key",
					},
					z.object({ error: z.string() })
				),
				403
			);
		}

		const createdTimelineItem = await createTimelineItem({
			db,
			organizationId: organization.id,
			websiteId: website.id,
			conversationId: body.conversationId,
			conversationOwnerVisitorId: visitorId,
			item: {
				type: body.item.type ?? ConversationTimelineType.MESSAGE,
				text: body.item.text,
				parts: body.item.parts ?? [{ type: "text", text: body.item.text }],
				visibility: body.item.visibility,
				userId: isPublic ? null : (body.item.userId ?? null),
				aiAgentId: isPublic ? null : (body.item.aiAgentId ?? null),
				visitorId: visitorId ?? null,
				createdAt: body.item.createdAt
					? new Date(body.item.createdAt)
					: undefined,
			},
		});

		// Determine the actor from the created timeline item
		let actor: ConversationActor;
		if (createdTimelineItem.userId) {
			actor = { type: "user", userId: createdTimelineItem.userId };
		} else if (createdTimelineItem.aiAgentId) {
			actor = { type: "aiAgent", aiAgentId: createdTimelineItem.aiAgentId };
		} else if (createdTimelineItem.visitorId) {
			actor = { type: "visitor", visitorId: createdTimelineItem.visitorId };
		} else {
			// Fallback to visitor if no actor is set (shouldn't happen)
			actor = { type: "visitor", visitorId: visitorId ?? "" };
		}

		// Mark conversation as seen by the actor after sending timeline item
		const lastSeenAt = await markConversationAsSeen(db, {
			conversation,
			actor,
		});

		// Build promises for realtime events and presence tracking
		const promises: Promise<unknown>[] = [];

		// Emit conversation seen event for all actor types
		promises.push(
			emitConversationSeenEvent({
				conversation,
				actor:
					actor.type === "aiAgent"
						? { type: "ai_agent", aiAgentId: actor.aiAgentId }
						: actor,
				lastSeenAt,
			})
		);

		// Mark presence only for visitors and users (not AI agents)
		if (actor.type === "visitor") {
			promises.push(
				markVisitorPresence({
					websiteId: website.id,
					visitorId: actor.visitorId,
					lastSeenAt,
				})
			);
		} else if (actor.type === "user") {
			promises.push(
				markUserPresence({
					websiteId: website.id,
					userId: actor.userId,
					lastSeenAt,
				})
			);
		}

		await Promise.allSettled(promises);

		return c.json(
			validateResponse(
				{ item: createdTimelineItem as TimelineItem },
				sendTimelineItemResponseSchema
			)
		);
	}
);
