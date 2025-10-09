import { beforeEach, describe, expect, it } from "bun:test";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import type { ConversationSeen } from "@cossistant/types/schemas";
import {
	applyConversationSeenEvent,
	createSeenStore,
	hydrateConversationSeen,
	type SeenStore,
	upsertConversationSeen,
} from "./seen-store";

function createEntry(
	overrides: Partial<ConversationSeen> = {}
): ConversationSeen {
	const base: ConversationSeen = {
		id: "seen-1",
		conversationId: "conv-1",
		userId: "user-1",
		visitorId: null,
		aiAgentId: null,
		lastSeenAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
		deletedAt: null,
	};

	return { ...base, ...overrides };
}

describe("seen store", () => {
	let store: SeenStore;

	function getEntries(conversationId: string) {
		return store.getState().conversations[conversationId] ?? {};
	}

	beforeEach(() => {
		store = createSeenStore();
	});

	it("upserts new entries and ignores stale timestamps", () => {
		const lastSeen = new Date("2024-01-01T00:00:00.000Z");
		upsertConversationSeen(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			lastSeenAt: lastSeen,
		});

		expect(Object.keys(getEntries("conv-1"))).toHaveLength(1);

		upsertConversationSeen(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			lastSeenAt: new Date("2023-12-31T23:59:59.000Z"),
		});

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(1);
		const entry = entries["conv-1:user:user-1"];
		expect(entry?.lastSeenAt.getTime()).toBe(lastSeen.getTime());
	});

	it("hydrates conversations from API payloads", () => {
		const payload: ConversationSeen[] = [
			createEntry({ id: "seen-1", userId: "user-2" }),
			createEntry({
				id: "seen-2",
				userId: null,
				visitorId: "visitor-1",
				updatedAt: new Date("2024-01-01T01:00:00.000Z").toISOString(),
				lastSeenAt: new Date("2024-01-01T01:00:00.000Z").toISOString(),
			}),
		];

		hydrateConversationSeen(store, "conv-1", payload);

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(2);
		expect(entries["conv-1:user:user-2"]?.actorType).toBe("user");
		expect(entries["conv-1:visitor:visitor-1"]?.actorType).toBe("visitor");
		expect(entries["conv-1:visitor:visitor-1"]?.lastSeenAt).toBeInstanceOf(
			Date
		);
	});

	it("ignores hydrate payloads without valid actors", () => {
		hydrateConversationSeen(store, "conv-1", [
			createEntry({ userId: null, visitorId: null, aiAgentId: null }),
		]);

		expect(Object.keys(getEntries("conv-1"))).toHaveLength(0);
	});

	it("applies realtime events with ignore filters", () => {
const event: RealtimeEvent<"CONVERSATION_SEEN"> = {
type: "CONVERSATION_SEEN",
timestamp: Date.now(),
organizationId: "org-1",
websiteId: "site-1",
visitorId: "visitor-1",
payload: {
conversationId: "conv-1",
visitorId: "visitor-1",
userId: null,
aiAgentId: null,
lastSeenAt: new Date("2024-01-01T02:00:00.000Z").toISOString(),
websiteId: "site-1",
organizationId: "org-1",
},
};

		applyConversationSeenEvent(store, event, {
			ignoreVisitorId: "visitor-1",
		});

		expect(Object.keys(getEntries("conv-1"))).toHaveLength(0);

		applyConversationSeenEvent(store, event);

		const entries = getEntries("conv-1");
		expect(Object.keys(entries)).toHaveLength(1);
		expect(entries["conv-1:visitor:visitor-1"]?.actorType).toBe("visitor");
	});

	it("clears conversations", () => {
		upsertConversationSeen(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			lastSeenAt: new Date("2024-01-01T00:00:00.000Z"),
		});

		store.clear("conv-1");

		expect(store.getState().conversations["conv-1"]).toBeUndefined();
	});
});
