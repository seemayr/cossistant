import { beforeEach, describe, expect, it } from "bun:test";
import type { Conversation, Message, RealtimeEvent } from "@cossistant/types";
import type { CreateConversationRequestBody } from "@cossistant/types/api/conversation";
import type { SendMessageRequest } from "@cossistant/types/api/message";
import { CossistantClient } from "../client";
import { createMessagesStore } from "./messages-store";

type MessageCreatedData = RealtimeEvent<"MESSAGE_CREATED">;

function createMockMessage(overrides: Partial<Message> = {}): Message {
	const base: Message = {
		id: "msg-1",
		bodyMd: "Hello",
		type: "text",
		userId: "user-1",
		aiAgentId: null,
		parentMessageId: null,
		modelUsed: null,
		visitorId: "visitor-1",
		conversationId: "conv-1",
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
		deletedAt: null,
		visibility: "public",
	};

	return { ...base, ...overrides };
}

function createMockConversation(
	overrides: Partial<Conversation> = {}
): Conversation {
	const now = "2024-01-01T00:00:00.000Z";
	const base: Conversation = {
		id: "conv-1",
		title: undefined,
		createdAt: now,
		updatedAt: now,
		visitorId: "visitor-1",
		websiteId: "site-1",
		status: "open",
		lastMessage: undefined,
	};

	return { ...base, ...overrides };
}

describe("messages store", () => {
	it("ingests pages and merges messages", () => {
		const store = createMessagesStore();
		const firstPage = {
			conversationId: "conv-1",
			messages: [createMockMessage()],
			hasNextPage: false,
			nextCursor: undefined,
		};

		store.ingestPage(firstPage.conversationId, firstPage);

		expect(
			store.getState().conversations[firstPage.conversationId]?.messages
		).toHaveLength(1);

		const updatedMessage = createMockMessage({
			bodyMd: "Updated",
			updatedAt: "2024-01-01T00:01:00.000Z",
		});

		store.ingestPage(firstPage.conversationId, {
			messages: [updatedMessage],
			hasNextPage: false,
			nextCursor: undefined,
		});

		const conversation =
			store.getState().conversations[firstPage.conversationId];
		expect(conversation?.messages).toHaveLength(1);
		expect(conversation?.messages[0]?.bodyMd).toBe("Updated");
	});

	it("ingests single messages", () => {
		const store = createMessagesStore();
		const message = createMockMessage();

		store.ingestMessage(message);

		const conversation = store.getState().conversations[message.conversationId];
		expect(conversation?.messages).toHaveLength(1);
		expect(conversation?.messages[0]).toEqual(message);
	});

	it("removes messages by id", () => {
		const store = createMessagesStore();
		const message = createMockMessage();

		store.ingestMessage(message);
		store.removeMessage(message.conversationId, message.id);

		const conversation = store.getState().conversations[message.conversationId];
		expect(conversation?.messages).toHaveLength(0);
	});

	it("clears a conversation thread", () => {
		const store = createMessagesStore();
		const message = createMockMessage();

		store.ingestMessage(message);
		expect(
			store.getState().conversations[message.conversationId]
		).toBeDefined();

		store.clearConversation(message.conversationId);

		expect(
			store.getState().conversations[message.conversationId]
		).toBeUndefined();
	});

	it("finalizes optimistic messages by replacing them", () => {
		const store = createMessagesStore();
		const optimistic = createMockMessage({ id: "temp-1", bodyMd: "Draft" });
		const final = createMockMessage({ id: "server-1", bodyMd: "Final" });

		store.ingestMessage(optimistic);
		store.finalizeMessage(optimistic.conversationId, optimistic.id, final);

		const conversation =
			store.getState().conversations[optimistic.conversationId];
		expect(conversation?.messages).toHaveLength(1);
		expect(conversation?.messages[0]).toEqual(final);
	});

	it("normalizes realtime events", () => {
		const store = createMessagesStore();
const event: MessageCreatedData = {
type: "MESSAGE_CREATED",
timestamp: Date.now(),
organizationId: "org-1",
websiteId: "site-1",
visitorId: "visitor-1",
payload: {
message: {
					id: "msg-event",
					bodyMd: "Realtime",
					type: "text",
					userId: "user-1",
					aiAgentId: null,
					visitorId: "visitor-1",
					organizationId: "org-1",
					websiteId: "site-1",
					conversationId: "conv-1",
					parentMessageId: null,
					modelUsed: null,
					visibility: "public",
					createdAt: "2024-01-02T00:00:00.000Z",
					updatedAt: "2024-01-02T00:00:00.000Z",
					deletedAt: null,
},
conversationId: "conv-1",
websiteId: "site-1",
organizationId: "org-1",
visitorId: "visitor-1",
},
};

		store.ingestRealtime(event);

		const conversation = store.getState().conversations["conv-1"];
		expect(conversation?.messages).toHaveLength(1);
		expect(conversation?.messages[0]?.id).toBe("msg-event");
		expect(conversation?.messages[0]?.createdAt).toBe(
			"2024-01-02T00:00:00.000Z"
		);
	});
});

describe("CossistantClient message integration", () => {
	const config = {
		apiUrl: "https://api.example.com",
		wsUrl: "wss://api.example.com",
		publicKey: "pk_test",
	} as const;
	let client: CossistantClient;

	beforeEach(() => {
		client = new CossistantClient(config);
	});

	it("updates the store after fetching messages", async () => {
		const message = createMockMessage();
		const response = {
			messages: [message],
			hasNextPage: false,
			nextCursor: undefined,
		};

		// @ts-expect-error test override of private field for mocking
		client.restClient = {
			getConversationMessages: async () => response,
		};

		await client.getConversationMessages({
			conversationId: message.conversationId,
		});

		const stored =
			client.messagesStore.getState().conversations[message.conversationId];
		expect(stored?.messages[0]).toEqual(message);
	});

	it("optimistically adds a message and replaces it with the server response", async () => {
		const serverMessage = createMockMessage({
			id: "msg-server",
			bodyMd: "Server",
		});
		const optimisticId = "temp-msg";
		let stateDuringCall: Message[] | undefined;
		let receivedPayload: SendMessageRequest | undefined;

		// @ts-expect-error test override of private field for mocking
		client.restClient = {
			sendMessage: async (payload: SendMessageRequest) => {
				receivedPayload = payload;
				stateDuringCall =
					client.messagesStore.getState().conversations[
						serverMessage.conversationId
					]?.messages;
				return { message: serverMessage };
			},
		};

		await client.sendMessage({
			conversationId: serverMessage.conversationId,
			message: {
				id: optimisticId,
				bodyMd: "Draft",
				type: serverMessage.type,
				visibility: "public",
			},
		});

		expect(receivedPayload?.message.id).toBe(optimisticId);
		expect(stateDuringCall).toBeDefined();
		expect(stateDuringCall?.[0]?.id).toBe(optimisticId);

		const stored =
			client.messagesStore.getState().conversations[
				serverMessage.conversationId
			];
		expect(stored?.messages).toHaveLength(1);
		expect(stored?.messages[0]).toEqual(serverMessage);
	});

	it("rolls back the optimistic message when the request fails", async () => {
		const conversationId = "conv-rollback";
		const optimisticId = "temp-fail";
		const error = new Error("failed");
		let stateDuringCall: Message[] | undefined;

		// @ts-expect-error test override of private field for mocking
		client.restClient = {
			sendMessage: async () => {
				stateDuringCall =
					client.messagesStore.getState().conversations[conversationId]
						?.messages;
				throw error;
			},
		};

		await expect(
			client.sendMessage({
				conversationId,
				message: {
					id: optimisticId,
					bodyMd: "Rollback",
					type: "text",
					visibility: "public",
				},
			})
		).rejects.toThrow(error);

		expect(stateDuringCall).toBeDefined();
		expect(stateDuringCall?.[0]?.id).toBe(optimisticId);

		const stored =
			client.messagesStore.getState().conversations[conversationId];
		expect(stored?.messages ?? []).toHaveLength(0);
	});

	it("handles realtime message created events", () => {
		client.conversationsStore.ingestConversation(
			createMockConversation({ id: "conv-1" })
		);

const event = {
type: "MESSAGE_CREATED",
timestamp: Date.now(),
payload: {
message: {
					id: "msg-realtime",
					bodyMd: "stream",
					type: "text",
					userId: "user-1",
					aiAgentId: null,
					visitorId: "visitor-1",
					organizationId: "org-1",
					websiteId: "site-1",
					conversationId: "conv-1",
					parentMessageId: null,
					modelUsed: null,
					visibility: "public",
					createdAt: "2024-01-03T00:00:00.000Z",
					updatedAt: "2024-01-03T00:00:00.000Z",
					deletedAt: null,
},
conversationId: "conv-1",
websiteId: "site-1",
organizationId: "org-1",
visitorId: "visitor-1",
},
websiteId: "site-1",
organizationId: "org-1",
visitorId: "visitor-1",
		} satisfies RealtimeEvent<"MESSAGE_CREATED">;

		client.handleRealtimeEvent(event);

		const stored = client.messagesStore.getState().conversations["conv-1"];
		expect(stored?.messages).toHaveLength(1);
		expect(stored?.messages[0]?.id).toBe("msg-realtime");

		const conversation = client.conversationsStore.getState().byId["conv-1"];
		expect(conversation?.lastMessage?.id).toBe("msg-realtime");
		expect(conversation?.updatedAt).toBe("2024-01-03T00:00:00.000Z");
	});

	it("initiates a local conversation with default messages", () => {
		const defaultMessage = createMockMessage({
			id: "msg-default",
			conversationId: "conv-local",
		});

		const result = client.initiateConversation({
			conversationId: "conv-local",
			visitorId: "visitor-init",
			websiteId: "site-init",
			defaultMessages: [defaultMessage],
		});

		expect(result.conversationId).toBe("conv-local");
		const conversation =
			client.conversationsStore.getState().byId["conv-local"];
		expect(conversation?.visitorId).toBe("visitor-init");
		const messages =
			client.messagesStore.getState().conversations["conv-local"];
		expect(messages?.messages).toHaveLength(1);
		expect(messages?.messages[0]?.id).toBe("msg-default");
	});

	it("creates the conversation on the server when sending the first message", async () => {
		const conversationId = "conv-new";
		const defaultMessage = createMockMessage({
			id: "msg-default",
			conversationId,
			bodyMd: "Welcome",
			createdAt: "2024-02-01T00:00:00.000Z",
			updatedAt: "2024-02-01T00:00:00.000Z",
		});

		client.initiateConversation({
			conversationId,
			visitorId: "visitor-new",
			websiteId: "site-new",
			defaultMessages: [defaultMessage],
		});

		let receivedPayload: CreateConversationRequestBody | undefined;
		const serverConversation = createMockConversation({
			id: conversationId,
			visitorId: "visitor-new",
			websiteId: "site-new",
		});
		const serverMessages = [
			defaultMessage,
			createMockMessage({
				id: "msg-server",
				conversationId,
				bodyMd: "Hi there",
				createdAt: "2024-02-01T00:01:00.000Z",
				updatedAt: "2024-02-01T00:01:00.000Z",
			}),
		];

		// @ts-expect-error override for testing
		client.restClient = {
			createConversation: async (payload: CreateConversationRequestBody) => {
				receivedPayload = payload;
				return {
					conversation: serverConversation,
					initialMessages: serverMessages,
				};
			},
			sendMessage: async (_payload: SendMessageRequest) => {
				throw new Error("unexpected call");
			},
			getCurrentVisitorId: () => "visitor-new",
			getCurrentWebsiteId: () => "site-new",
		};

		const response = await client.sendMessage({
			conversationId,
			message: {
				bodyMd: "Hi there",
				type: "text",
				visitorId: "visitor-new",
				visibility: "public",
			},
		});

		expect(receivedPayload?.conversationId).toBe(conversationId);
		expect(receivedPayload?.defaultMessages).toHaveLength(2);
		expect(response.wasConversationCreated).toBe(true);
		expect(response.conversation).toEqual(serverConversation);
		const storedConversation =
			client.conversationsStore.getState().byId[conversationId];
		expect(storedConversation).toEqual(serverConversation);
		const storedMessages =
			client.messagesStore.getState().conversations[conversationId];
		expect(storedMessages?.messages).toEqual(serverMessages);
	});

	it("restores pending state when server creation fails", async () => {
		const conversationId = "conv-fail";
		const defaultMessage = createMockMessage({
			id: "msg-default",
			conversationId,
			bodyMd: "Hello",
		});

		client.initiateConversation({
			conversationId,
			defaultMessages: [defaultMessage],
			visitorId: "visitor-fail",
			websiteId: "site-fail",
		});

		const error = new Error("create failed");

		// @ts-expect-error override for testing
		client.restClient = {
			createConversation: async () => {
				throw error;
			},
			getCurrentVisitorId: () => "visitor-fail",
			getCurrentWebsiteId: () => "site-fail",
		};

		await expect(
			client.sendMessage({
				conversationId,
				message: {
					bodyMd: "Retry",
					type: "text",
					visitorId: "visitor-fail",
					visibility: "public",
				},
			})
		).rejects.toThrow(error);

		const storedMessages =
			client.messagesStore.getState().conversations[conversationId];
		expect(storedMessages?.messages).toHaveLength(1);
		expect(storedMessages?.messages[0]?.id).toBe(defaultMessage.id);
	});
});
