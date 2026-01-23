import { upsertVisitor } from "@api/db/queries";
import { getContactForVisitor } from "@api/db/queries/contact";
import { aiAgent } from "@api/db/schema/ai-agent";
import { member } from "@api/db/schema/auth";
import { visitor as visitorTable } from "@api/db/schema/website";
import { generateULID } from "@api/utils/db/ids";
import { computeMetadataHash } from "@api/utils/metadata-hash";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import { getMostRecentLastOnlineAt } from "@api/utils/website";
import { publicWebsiteResponseSchema } from "@cossistant/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import type { RestContext } from "../types";

export const websiteRouter = new OpenAPIHono<RestContext>();

websiteRouter.use("/*", ...protectedPublicApiKeyMiddleware);

// GET /website - Get website information linked to the API key
websiteRouter.openapi(
	{
		method: "get",
		path: "/",
		summary: "Get website information",
		description:
			"Returns the website information associated with the provided API key. This endpoint supports both public and private API keys with different authentication methods.",
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
				name: "Origin",
				in: "header",
				description:
					"Required when using public API keys. Must match one of the whitelisted domains for the website. Automatically set by browsers.",
				required: false,
				schema: {
					type: "string",
					format: "uri",
					example: "https://example.com",
				},
			},
			{
				name: "X-Visitor-Id",
				in: "header",
				description:
					"Visitor ID from localStorage. If provided, returns existing visitor data. If not provided, creates a new visitor.",
				required: false,
				schema: {
					type: "string",
					pattern: "^[0-9A-HJKMNP-TV-Z]{26}$",
					example: "01JG000000000000000000000",
				},
			},
		],
		responses: {
			200: {
				description: "Website information successfully retrieved",
				content: {
					"application/json": {
						schema: publicWebsiteResponseSchema,
					},
				},
			},
			401: {
				description: "Unauthorized - Invalid or missing API key",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
						}),
					},
				},
			},
			403: {
				description:
					"Forbidden - Origin validation failed for public key or domain not whitelisted",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
						}),
					},
				},
			},
			404: {
				description: "Website not found for this API key",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
						}),
					},
				},
			},
		},
		tags: ["Website"],
	},
	async (c) => {
		const { db, website, apiKey, visitorIdHeader } =
			await safelyExtractRequestData(c);

		// if visitorIdHeader is not provided, generate a new one
		const visitorId = visitorIdHeader ?? generateULID();

		const [visitor, organizationAdminsAndOwners, contact, websiteAiAgents] =
			await Promise.all([
				upsertVisitor(db, {
					websiteId: website.id,
					organizationId: website.organizationId,
					visitorId,
					isTest: apiKey.isTest,
				}),
				db.query.member.findMany({
					where: and(
						eq(member.organizationId, website.organizationId),
						or(eq(member.role, "admin"), eq(member.role, "owner"))
					),
					with: {
						user: true,
					},
					limit: 3,
				}),
				getContactForVisitor(db, {
					visitorId,
					websiteId: website.id,
				}),
				// Query active AI agents for this website
				db.query.aiAgent.findMany({
					where: and(
						eq(aiAgent.websiteId, website.id),
						eq(aiAgent.isActive, true),
						isNull(aiAgent.deletedAt)
					),
					columns: {
						id: true,
						name: true,
					},
				}),
			]);

		const availableHumanAgents = organizationAdminsAndOwners.map(
			(humanAgent) => ({
				id: humanAgent.user.id,
				name: humanAgent.user.name,
				email: humanAgent.user.email,
				image: humanAgent.user.image,
				lastSeenAt:
					humanAgent.user.lastSeenAt?.toISOString() ?? new Date().toISOString(),
			})
		);

		// Map AI agents to the AvailableAIAgent format
		const availableAIAgents = websiteAiAgents.map((agent) => ({
			id: agent.id,
			name: agent.name,
			image: null, // AI agents don't have avatars yet
		}));

		// iso string indicating support activity - uses most recent lastSeenAt from available human agents
		const lastOnlineAt = getMostRecentLastOnlineAt(availableHumanAgents);

		return c.json(
			validateResponse(
				{
					id: website.id,
					name: website.name,
					domain: website.domain,
					description: website.description,
					logoUrl: website.logoUrl,
					organizationId: website.organizationId,
					status: website.status,
					lastOnlineAt,
					availableHumanAgents,
					availableAIAgents,
					visitor: {
						id: visitor.id,
						isBlocked: Boolean(visitor.blockedAt),
						language: visitor.language,
						contact: contact
							? {
									id: contact.id,
									name: contact.name,
									email: contact.email,
									image: contact.image,
									metadataHash: computeMetadataHash(
										contact.metadata as Record<string, unknown> | null
									),
								}
							: null,
					},
				},
				publicWebsiteResponseSchema
			),
			200
		);
	}
);
