import { db } from "@api/db";
import { getTRPCSession } from "@api/db/queries/session";
import { findVisitorForWebsite } from "@api/db/queries/visitor";
import { getWebsiteByIdWithAccess } from "@api/db/queries/website";
import {
        AuthValidationError,
        performAuthentication,
} from "@api/lib/auth-validation";
import { realtime, type RealtimeMessageEvent } from "@api/realtime/realtime";
import { handle } from "@cossistant/realtime/server";
import type { OpenAPIHono } from "@hono/zod-openapi";

type MessageUserEvent = {
	data: RealtimeMessageEvent;
	__event_path: string[];
	__stream_id: string;
};

export function isMessageCreatedUserEvent(
	event: { __event_path?: unknown; data?: unknown }
): event is MessageUserEvent {
	if (!Array.isArray(event.__event_path)) {
		return false;
	}

	if (
		event.__event_path.length < 2 ||
		event.__event_path[0] !== "message" ||
		event.__event_path[1] !== "created"
	) {
		return false;
	}

	if (!event.data || typeof event.data !== "object") {
		return false;
	}

	return (event.data as { type?: unknown }).type === "MESSAGE_CREATED";
}

export function matchesVisitorMessageSubscription(
	event: MessageUserEvent,
	requestedVisitorId: string | null | undefined
): boolean {
	if (!requestedVisitorId) {
		return false;
	}

const payloadVisitorId =
event.data.visitorId ??
event.data.payload.visitorId ??
event.data.payload.message.visitorId ??
null;

	if (!payloadVisitorId) {
		return false;
	}

	return payloadVisitorId === requestedVisitorId;
}

function parseOriginHeaders(request: Request): {
origin?: string;
protocol?: string;
hostname?: string;
} {
        const origin = request.headers.get("origin") ?? undefined;
        if (!origin) {
                return {};
        }

        try {
                const url = new URL(origin);
                return { origin, protocol: url.protocol, hostname: url.hostname };
        } catch {
                return { origin };
        }
}

const visitorStreamHandler = handle({
        realtime,
        middleware: async ({ request, channel }) => {
                const url = new URL(request.url);
                const publicKey = url.searchParams.get("publicKey");
                const visitorId = url.searchParams.get("visitorId");

                if (!publicKey || !visitorId) {
                        return new Response("Missing credentials", { status: 401 });
                }

                try {
                        const authResult = await performAuthentication(
                                undefined,
                                publicKey,
                                db,
                                parseOriginHeaders(request)
                        );

                        const websiteId = authResult.apiKey.website?.id;

                        if (!websiteId) {
                                return new Response("Website not found", { status: 403 });
                        }

                        if (channel !== websiteId) {
                                return new Response("Channel mismatch", { status: 403 });
                        }

                        const visitor = await findVisitorForWebsite(db, {
                                visitorId,
                                websiteId,
                        });

                        if (!visitor || visitor.blockedAt) {
                                return new Response("Visitor not allowed", { status: 403 });
                        }
                } catch (error) {
                        if (error instanceof AuthValidationError) {
                                return new Response(error.message, { status: error.statusCode });
                        }
                        console.error("[Realtime] Visitor auth failed", error);
                        return new Response("Authentication failed", { status: 401 });
                }
        },
filter: async ({ event, request }) => {
if (!isMessageCreatedUserEvent(event)) {
return false;
}

const visitorId = new URL(request.url).searchParams.get("visitorId");
return matchesVisitorMessageSubscription(event, visitorId);
},
});

const dashboardStreamHandler = handle({
realtime,
        middleware: async ({ request, channel }) => {
                if (!channel) {
                        return new Response("Channel is required", { status: 400 });
                }

                const session = await getTRPCSession(db, { headers: request.headers });

                if (!session?.user?.id) {
                        return new Response("Unauthorized", { status: 401 });
                }

                const website = await getWebsiteByIdWithAccess(db, {
                        userId: session.user.id,
                        websiteId: channel,
                });

                if (!website) {
                        return new Response("Forbidden", { status: 403 });
                }
        },
filter: ({ event }) => isMessageCreatedUserEvent(event),
        responseHeaders: ({ request }) => {
                const origin = request.headers.get("origin");
                if (!origin) {
                        return undefined;
                }

                return {
                        "Access-Control-Allow-Origin": origin,
                        "Access-Control-Allow-Credentials": "true",
                        Vary: "Origin",
                } satisfies HeadersInit;
        },
});

export function registerRealtimeRoutes(app: OpenAPIHono): void {
        app.get("/v1/realtime/visitor", async (c) => {
                const response = await visitorStreamHandler(c.req.raw);
                return response ?? new Response(null, { status: 204 });
        });

        app.get("/v1/realtime/dashboard", async (c) => {
                const response = await dashboardStreamHandler(c.req.raw);
                return response ?? new Response(null, { status: 204 });
        });
}
