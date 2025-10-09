import { describe, expect, it, mock } from "bun:test";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";

mock.module("@cossistant/realtime/server", () => ({
        handle: () => () => Promise.resolve(undefined),
        Realtime: class {},
}));

mock.module("@api/realtime/realtime", () => ({
        realtime: {},
}));

mock.module("@api/db", () => ({ db: {} }));
mock.module("@api/db/queries/session", () => ({ getTRPCSession: async () => null }));
mock.module("@api/db/queries/visitor", () => ({ findVisitorForWebsite: async () => null }));
mock.module("@api/db/queries/website", () => ({ getWebsiteByIdWithAccess: async () => null }));
mock.module("@api/lib/auth-validation", () => ({
        AuthValidationError: class extends Error {
                statusCode = 401;
        },
        performAuthentication: async () => ({
                apiKey: { website: { id: "site-1" } },
                organizationId: "org-1",
        }),
}));

const {
        isMessageCreatedUserEvent,
        matchesVisitorMessageSubscription,
} = await import("./routes");

describe("isMessageCreatedUserEvent", () => {
        it("identifies message.created events", () => {
                const event = {
                        __event_path: ["message", "created"],
                        __stream_id: "0-1",
                        data: {
                                type: "MESSAGE_CREATED",
                                payload: {
                                        message: {
                                                id: "msg-1",
                                                bodyMd: "hi",
                                                type: "text",
                                                userId: null,
                                                visitorId: "visitor-1",
                                                organizationId: "org-1",
                                                websiteId: "site-1",
                                                conversationId: "conv-1",
                                                parentMessageId: null,
                                                aiAgentId: null,
                                                modelUsed: null,
                                                visibility: "public",
                                                createdAt: new Date().toISOString(),
                                                updatedAt: new Date().toISOString(),
                                                deletedAt: null,
                                        },
                                        conversationId: "conv-1",
                                        websiteId: "site-1",
                                        organizationId: "org-1",
                                        visitorId: "visitor-1",
                                },
                                timestamp: Date.now(),
                                organizationId: "org-1",
                                websiteId: "site-1",
                                visitorId: "visitor-1",
                        },
                } satisfies Record<string, unknown>;

                expect(isMessageCreatedUserEvent(event)).toBe(true);
        });

        it("returns false for other event paths", () => {
                const event = {
                        __event_path: ["conversation", "created"],
                        __stream_id: "0-2",
                        data: {
                                type: "CONVERSATION_CREATED",
                        },
                } satisfies Record<string, unknown>;

                expect(isMessageCreatedUserEvent(event)).toBe(false);
        });
});

describe("matchesVisitorMessageSubscription", () => {
        const baseEvent: MessageUserEvent = {
                __event_path: ["message", "created"],
                __stream_id: "0-1",
                data: {
                        type: "MESSAGE_CREATED",
                        payload: {
                                message: {
                                        id: "msg-visitor",
                                        bodyMd: "hello",
                                        type: "text",
                                        userId: null,
                                        visitorId: null,
                                        organizationId: "org-1",
                                        websiteId: "site-1",
                                        conversationId: "conv-1",
                                        parentMessageId: null,
                                        aiAgentId: null,
                                        modelUsed: null,
                                        visibility: "public",
                                        createdAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString(),
                                        deletedAt: null,
                                },
                                conversationId: "conv-1",
                                websiteId: "site-1",
                                organizationId: "org-1",
                                visitorId: "visitor-1",
                        },
                        timestamp: Date.now(),
                        organizationId: "org-1",
                        websiteId: "site-1",
                        visitorId: "visitor-1",
                },
        } satisfies MessageUserEvent;

        it("matches when visitor ids align", () => {
                expect(matchesVisitorMessageSubscription(baseEvent, "visitor-1")).toBe(true);
        });

        it("falls back to payload message visitor when event visitor is null", () => {
                const eventWithPayloadOnly: MessageUserEvent = {
                        ...baseEvent,
                        data: {
                                ...baseEvent.data,
                                visitorId: null,
                        },
                } satisfies MessageUserEvent;

                expect(
                        matchesVisitorMessageSubscription(eventWithPayloadOnly, "visitor-1")
                ).toBe(true);
        });

        it("returns false when visitor id is missing", () => {
                const noVisitorEvent: MessageUserEvent = {
                        ...baseEvent,
                        data: {
                                ...baseEvent.data,
                                visitorId: null,
                                payload: {
                                        ...baseEvent.data.payload,
                                        visitorId: null,
                                },
                        },
                } satisfies MessageUserEvent;

                expect(matchesVisitorMessageSubscription(noVisitorEvent, "visitor-1")).toBe(
                        false
                );
        });
});

type MessageUserEvent = {
        __event_path: string[];
        __stream_id: string;
        data: RealtimeEvent<"MESSAGE_CREATED">;
};
