import { env } from "@api/env";
import { auth } from "@api/lib/auth";
import { createApiBrowserCorsMiddleware } from "@api/lib/browser-cors";
import {
	authRateLimiter,
	defaultRateLimiter,
	trpcRateLimiter,
	websocketRateLimiter,
} from "@api/middleware/rate-limit";
import {
	actorUserIdHeader,
	openApiSecuritySchemes,
	PRIVATE_API_KEY_SECURITY_SCHEME,
	PUBLIC_API_KEY_SECURITY_SCHEME,
	privateApiKeyAuthorizationHeader,
	publicApiKeyHeader,
	publicApiKeyOriginHeader,
	visitorIdHeader,
} from "@api/rest/openapi";
import { routers } from "@api/rest/routers";
import { knowledgeClarificationStreamRouter } from "@api/routes/knowledge-clarification-stream";
import { createTRPCContext } from "@api/trpc/init";
import { origamiTRPCRouter } from "@api/trpc/routers/_app";
import { checkHealth } from "@api/utils/health";
import { swaggerUI } from "@hono/swagger-ui";
import { trpcServer } from "@hono/trpc-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { db } from "./db";
import { getTRPCSession } from "./db/queries/session";
import { polarRouters } from "./polar";
import { realtime } from "./realtime/emitter";
import { resendRouters } from "./resend";
import { sesRouters } from "./ses";
import { workflowsRouters } from "./workflows";
import { upgradedWebsocket, websocket } from "./ws/socket";

const SEARCH_ENGINE_NOINDEX = "noindex, nofollow";

const app = new OpenAPIHono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
		realtime: typeof realtime;
	};
}>();

const stripSetCookie: MiddlewareHandler = async (c, next) => {
	await next();
	c.res.headers.delete("Set-Cookie");
};

const apiBrowserCors = createApiBrowserCorsMiddleware();

// Logger middleware
app.use(logger());

// Attach realtime emitter to the context
app.use("*", async (c, next) => {
	c.set("realtime", realtime);
	await next();
});

// Secure headers middleware
app.use(secureHeaders());

// Keep utility and machine-readable API routes out of search results.
app.use("*", async (c, next) => {
	await next();
	c.header("X-Robots-Tag", SEARCH_ENGINE_NOINDEX);
});

// Health check endpoint
app.get("/health", async (c) => {
	try {
		const health = await checkHealth();
		return c.json({ status: "healthy" }, health ? 200 : 503);
	} catch (_error) {
		return c.json(
			{ status: "unhealthy", error: "Database connection failed" },
			503
		);
	}
});

// Robots.txt to prevent search engine indexing
app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));

// CORS middleware for auth and TRPC endpoints (trusted domains only)
app.use("/api/auth/*", apiBrowserCors);

app.use("/trpc/*", apiBrowserCors);

app.use("/api/knowledge-clarification/*", apiBrowserCors);

// CORS middleware for V1 API (public access)
app.use(
	"/v1/*",
	cors({
		origin: "*",
		maxAge: 86_400,
		credentials: false,
	})
);

// Apply rate limiting before session handling
app.use("/trpc/*", trpcRateLimiter);
app.use("/api/knowledge-clarification/*", trpcRateLimiter);

app.use("/trpc/*", async (c, next) => {
	const session = await getTRPCSession(db, {
		headers: c.req.raw.headers,
	});

	if (!session) {
		c.set("user", null);
		c.set("session", null);

		return next();
	}

	c.set("user", session.user);
	c.set("session", session.session);

	return next();
});

app.use("/api/knowledge-clarification/*", async (c, next) => {
	const session = await getTRPCSession(db, {
		headers: c.req.raw.headers,
	});

	if (!session) {
		c.set("user", null);
		c.set("session", null);

		return next();
	}

	c.set("user", session.user);
	c.set("session", session.session);

	return next();
});

// Auth routes with strict rate limiting
app.use("/api/auth/*", authRateLimiter);
app.all("/api/auth/*", async (c) => await auth.handler(c.req.raw));

// TRPC routes
app.use(
	"/trpc/*",
	trpcServer({
		router: origamiTRPCRouter,
		createContext: createTRPCContext,
	})
);

app.route("/api/knowledge-clarification", knowledgeClarificationStreamRouter);

// REST API routes with default rate limiting
app.use("/v1/*", defaultRateLimiter);
app.use("/v1/*", stripSetCookie);
app.route("/v1", routers);

if (env.POLAR_ENABLED !== false) {
	app.route("/polar", polarRouters);
}
app.route("/resend", resendRouters);
app.route("/ses", sesRouters);
app.route("/workflow", workflowsRouters);

// WebSocket endpoint for real-time communication with rate limiting
app.use("/ws", websocketRateLimiter);
app.get("/ws", upgradedWebsocket);

const websocketTokenQueryParameter = {
	name: "token",
	in: "query",
	required: false,
	description:
		"Private API key for query-param-based WebSocket authentication. This is intended for trusted internal dashboards only.",
	schema: {
		type: "string",
		example: "sk_test_xxx",
	},
} as const;

const websocketActorUserIdQueryParameter = {
	name: "actorUserId",
	in: "query",
	required: false,
	description:
		"Acting teammate identifier for unlinked private API keys. Required when the private key is not linked and ignored when it is linked.",
	schema: {
		type: "string",
		example: "01JG000000000000000000000",
	},
} as const;

const websocketSessionTokenQueryParameter = {
	name: "sessionToken",
	in: "query",
	required: false,
	description:
		"Dashboard session token for first-party authenticated user connections.",
	schema: {
		type: "string",
		example: "session_abc123",
	},
} as const;

const websocketWebsiteIdQueryParameter = {
	name: "websiteId",
	in: "query",
	required: false,
	description:
		"Optional website override for first-party session connections with access to multiple websites.",
	schema: {
		type: "string",
		example: "01JG000000000000000000000",
	},
} as const;

const websocketPublicKeyQueryParameter = {
	name: "publicKey",
	in: "query",
	required: false,
	description:
		"Public API key for browser/widget WebSocket authentication when custom headers are unavailable.",
	schema: {
		type: "string",
		example: "pk_test_xxx",
	},
} as const;

const openApiDocument = {
	openapi: "3.1.0",
	info: {
		version: "0.0.1",
		title: "Cossistant API",
		description:
			"Cossistant API. Private keys are for trusted server-side integrations and internal dashboards only.",
		license: {
			name: "AGPL-3.0 license",
			url: "https://github.com/cossistantcom/cossistant/blob/main/LICENSE",
		},
	},
	servers: [
		{
			url: "https://api.cossistant.com/v1",
			description: "Production server",
		},
	],
	components: {
		securitySchemes: openApiSecuritySchemes,
		schemas: {
			RestErrorResponse: {
				type: "object",
				required: ["error"],
				properties: {
					error: {
						type: "string",
						example: "FORBIDDEN",
					},
					message: {
						type: "string",
						example: "Private API key required",
					},
				},
			},
			RealtimeConnectionEstablishedMessage: {
				type: "object",
				required: ["type", "payload"],
				properties: {
					type: {
						type: "string",
						const: "CONNECTION_ESTABLISHED",
					},
					payload: {
						type: "object",
						required: ["connectionId"],
						properties: {
							connectionId: {
								type: "string",
								example: "conn_123",
							},
						},
					},
				},
				example: {
					type: "CONNECTION_ESTABLISHED",
					payload: {
						connectionId: "conn_123",
					},
				},
			},
			RealtimeErrorMessage: {
				type: "object",
				required: ["error", "message"],
				properties: {
					error: {
						type: "string",
						example: "Authentication failed",
					},
					message: {
						type: "string",
						example:
							"X-Actor-User-Id is required when using an unlinked private API key",
					},
					code: {
						type: "integer",
						example: 400,
					},
				},
			},
			RealtimeEventEnvelope: {
				type: "object",
				required: ["type", "payload"],
				properties: {
					type: {
						type: "string",
						example: "conversationUpdated",
					},
					payload: {
						type: "object",
						description:
							"Realtime event payload. The exact shape depends on the event type.",
						additionalProperties: true,
					},
				},
			},
		},
	},
	paths: {
		"/ws": {
			get: {
				summary: "Open a realtime WebSocket connection",
				description:
					"Upgrades the request to a WebSocket connection for realtime events. Trusted internal dashboards may authenticate with a private API key via `Authorization: Bearer sk_...` or `?token=sk_...`. Unlinked private keys must also provide `X-Actor-User-Id` or `?actorUserId=...`; linked private keys ignore explicit actor input. Public/widget connections may use `X-Public-Key` or `?publicKey=...` with a valid visitor ID. Do not embed private keys in public-facing applications.",
				operationId: "connectRealtimeWebSocket",
				tags: ["Realtime"],
				servers: [
					{
						url: "wss://api.cossistant.com",
						description: "Production WebSocket server",
					},
				],
				security: [
					{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] },
					{ [PUBLIC_API_KEY_SECURITY_SCHEME]: [] },
				],
				parameters: [
					privateApiKeyAuthorizationHeader,
					publicApiKeyHeader,
					publicApiKeyOriginHeader,
					actorUserIdHeader,
					visitorIdHeader,
					websocketTokenQueryParameter,
					websocketActorUserIdQueryParameter,
					websocketSessionTokenQueryParameter,
					websocketWebsiteIdQueryParameter,
					websocketPublicKeyQueryParameter,
				],
				responses: {
					101: {
						description:
							"Switching Protocols. After the upgrade the server sends a `CONNECTION_ESTABLISHED` message, error envelopes, and realtime event envelopes.",
					},
					401: {
						description: "Unauthorized handshake",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/RealtimeErrorMessage",
								},
							},
						},
					},
					403: {
						description:
							"Forbidden handshake, including invalid actor resolution for private keys",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/RealtimeErrorMessage",
								},
							},
						},
					},
				},
			},
		},
	},
};

app.doc("/openapi", openApiDocument as Parameters<typeof app.doc>[1]);

app.get(
	"/docs",
	swaggerUI({
		url: "/openapi",
	})
);

export { app, openApiDocument };

export default {
	port: env.PORT,
	fetch: app.fetch,
	websocket,
};
