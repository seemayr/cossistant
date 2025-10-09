import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import type { EventContext } from "./router";
import { routeEvent } from "./router";

const sendToWebsite = mock<NonNullable<EventContext["sendToWebsite"]>>();
const sendToVisitor = mock<NonNullable<EventContext["sendToVisitor"]>>();
const sendToConnection = mock<NonNullable<EventContext["sendToConnection"]>>();

describe("routeEvent", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

it("routes presence updates to website connections", async () => {
const event: RealtimeEvent<"USER_PRESENCE_UPDATE"> = {
type: "USER_PRESENCE_UPDATE",
payload: {
userId: "user-123",
status: "online",
lastSeen: Date.now(),
organizationId: "org-1",
websiteId: "website-789",
visitorId: null,
},
timestamp: Date.now(),
websiteId: "website-789",
organizationId: "org-1",
visitorId: null,
		};

		await routeEvent(event, {
			connectionId: "conn-123",
			websiteId: "website-789",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual([
			"website-789",
			event,
			{ exclude: "conn-123" },
		]);
		expect(sendToVisitor).not.toHaveBeenCalled();
	});

it("routes visitor events to dashboards", async () => {
const event: RealtimeEvent<"VISITOR_CONNECTED"> = {
type: "VISITOR_CONNECTED",
payload: {
visitorId: "visitor-123",
connectionId: "conn-456",
timestamp: Date.now(),
organizationId: "org-1",
websiteId: "website-abc",
},
timestamp: Date.now(),
websiteId: "website-abc",
organizationId: "org-1",
visitorId: "visitor-123",
		};

		await routeEvent(event, {
			connectionId: "conn-456",
			websiteId: "website-abc",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual([
			"website-abc",
			event,
			undefined,
		]);
	});
});

describe("MESSAGE_CREATED handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

it("forwards messages to dashboards and the matching visitor", async () => {
const event: RealtimeEvent<"MESSAGE_CREATED"> = {
type: "MESSAGE_CREATED",
payload: {
message: {
					id: "msg-1",
					bodyMd: "hello",
					type: "text",
					userId: "user-1",
					aiAgentId: null,
					visitorId: "visitor-1",
					organizationId: "org-1",
					websiteId: "site-1",
					conversationId: "conv-1",
					parentMessageId: null,
					modelUsed: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null,
					visibility: "public",
},
conversationId: "conv-1",
websiteId: "site-1",
organizationId: "org-1",
visitorId: "visitor-1",
},
timestamp: Date.now(),
websiteId: "site-1",
organizationId: "org-1",
visitorId: "visitor-1",
		};

		await routeEvent(event, {
			connectionId: "conn-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-1", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-1", event]);
	});

it("falls back to context visitor when message has no visitorId", async () => {
const event: RealtimeEvent<"MESSAGE_CREATED"> = {
type: "MESSAGE_CREATED",
payload: {
message: {
					id: "msg-ctx-1",
					bodyMd: "from agent",
					type: "text",
					userId: "user-2",
					aiAgentId: null,
					visitorId: null,
					organizationId: "org-ctx",
					websiteId: "site-ctx",
					conversationId: "conv-ctx",
					parentMessageId: null,
					modelUsed: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null,
					visibility: "public",
},
conversationId: "conv-ctx",
websiteId: "site-ctx",
organizationId: "org-ctx",
visitorId: null,
},
timestamp: Date.now(),
websiteId: "site-ctx",
organizationId: "org-ctx",
visitorId: "visitor-from-context",
		};

		await routeEvent(event, {
			connectionId: "conn-ctx",
			websiteId: "site-ctx",
			visitorId: "visitor-from-context",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual([
			"visitor-from-context",
			event,
		]);
	});
});

describe("CONVERSATION_SEEN handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("broadcasts to dashboards and conversation visitor", async () => {
const event: RealtimeEvent<"CONVERSATION_SEEN"> = {
type: "CONVERSATION_SEEN",
payload: {
conversationId: "conv-seen-1",
websiteId: "site-seen",
organizationId: "org-seen",
lastSeenAt: new Date().toISOString(),
actorType: "user",
actorId: "user-actor",
userId: "user-actor",
visitorId: null,
aiAgentId: null,
},
			timestamp: Date.now(),
			websiteId: "site-seen",
			organizationId: "org-seen",
			visitorId: "visitor-xyz",
		};

		await routeEvent(event, {
			connectionId: "conn-seen",
			websiteId: "site-seen",
			visitorId: "visitor-xyz",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-seen", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-xyz", event]);
	});

	it("emits to actor visitor when visitor sees conversation", async () => {
		const visitorId = "visitor-actor";
const event: RealtimeEvent<"CONVERSATION_SEEN"> = {
type: "CONVERSATION_SEEN",
payload: {
conversationId: "conv-seen-2",
websiteId: "site-seen",
organizationId: "org-seen",
lastSeenAt: new Date().toISOString(),
actorType: "visitor",
actorId: visitorId,
userId: null,
visitorId,
aiAgentId: null,
},
			timestamp: Date.now(),
			websiteId: "site-seen",
			organizationId: "org-seen",
			visitorId,
		};

		await routeEvent(event, {
			connectionId: "conn-seen",
			websiteId: "site-seen",
			visitorId,
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual([visitorId, event]);
	});
});

describe("CONVERSATION_TYPING handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("broadcasts typing state to dashboards and visitors", async () => {
const event: RealtimeEvent<"CONVERSATION_TYPING"> = {
type: "CONVERSATION_TYPING",
payload: {
conversationId: "conv-typing",
websiteId: "site-typing",
organizationId: "org-typing",
actorType: "user",
actorId: "user-123",
isTyping: true,
userId: "user-123",
visitorId: null,
aiAgentId: null,
visitorPreview: null,
},
			timestamp: Date.now(),
			websiteId: "site-typing",
			organizationId: "org-typing",
			visitorId: "visitor-owner",
		};

		await routeEvent(event, {
			connectionId: "conn-typing",
			websiteId: "site-typing",
			visitorId: "visitor-owner",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-typing", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-owner", event]);
	});
});

describe("CONVERSATION_EVENT_CREATED handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("broadcasts timeline events to dashboards and visitor", async () => {
const event: RealtimeEvent<"CONVERSATION_EVENT_CREATED"> = {
type: "CONVERSATION_EVENT_CREATED",
payload: {
conversationId: "conv-event",
websiteId: "site-event",
organizationId: "org-event",
visitorId: null,
event: {
					id: "evt-1",
					conversationId: "conv-event",
					organizationId: "org-event",
					type: "STATUS_CHANGED",
					actorUserId: "user-1",
					actorAiAgentId: null,
					targetUserId: null,
					targetAiAgentId: null,
					message: null,
					metadata: null,
					createdAt: new Date().toISOString(),
				},
			},
			timestamp: Date.now(),
			websiteId: "site-event",
			organizationId: "org-event",
			visitorId: "visitor-event",
		};

		await routeEvent(event, {
			connectionId: "conn-event",
			websiteId: "site-event",
			visitorId: "visitor-event",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-event", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-event", event]);
	});
});

describe("CONVERSATION_CREATED handler", () => {
	beforeEach(() => {
		sendToWebsite.mockReset();
		sendToVisitor.mockReset();
		sendToConnection.mockReset();
	});

	it("broadcasts new conversations to dashboards and visitor", async () => {
const event: RealtimeEvent<"CONVERSATION_CREATED"> = {
type: "CONVERSATION_CREATED",
payload: {
conversationId: "conv-created",
websiteId: "site-created",
organizationId: "org-created",
visitorId: "visitor-created",
conversation: {
					id: "conv-created",
					title: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					visitorId: "visitor-created",
					websiteId: "site-created",
					status: "open",
					lastMessage: undefined,
				},
				header: {
					id: "conv-created",
					status: "open",
					priority: "normal",
					organizationId: "org-created",
					visitorId: "visitor-created",
					visitor: {
						id: "visitor-created",
						lastSeenAt: null,
						blockedAt: null,
						blockedByUserId: null,
						isBlocked: false,
						contact: null,
					},
					websiteId: "site-created",
					channel: "widget",
					title: null,
					resolutionTime: null,
					startedAt: new Date().toISOString(),
					firstResponseAt: null,
					resolvedAt: null,
					resolvedByUserId: null,
					resolvedByAiAgentId: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null,
					lastMessageAt: null,
					lastSeenAt: null,
					lastMessagePreview: null,
					viewIds: [],
					seenData: [],
				},
			},
			timestamp: Date.now(),
			websiteId: "site-created",
			organizationId: "org-created",
			visitorId: "visitor-created",
		};

		await routeEvent(event, {
			connectionId: "conn-created",
			websiteId: "site-created",
			sendToWebsite,
			sendToVisitor,
			sendToConnection,
		});

		expect(sendToWebsite).toHaveBeenCalledTimes(1);
		expect(sendToWebsite.mock.calls[0]).toEqual(["site-created", event]);
		expect(sendToVisitor).toHaveBeenCalledTimes(1);
		expect(sendToVisitor.mock.calls[0]).toEqual(["visitor-created", event]);
	});
});
