import { beforeEach, describe, expect, it } from "bun:test";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import {
	applyConversationTypingEvent,
	clearTypingFromMessage,
	clearTypingState,
	createTypingStore,
	setTypingState,
	type TypingEntry,
	type TypingStore,
} from "./typing-store";

type FakeTimerHandle = number;

type ScheduledTimer = {
	callback: () => void;
	triggerAt: number;
};

function createFakeTimers() {
	let now = 0;
	let id = 0;
	const timers = new Map<FakeTimerHandle, ScheduledTimer>();

	const schedule = (callback: () => void, delay: number) => {
		const handle = ++id;
		timers.set(handle, {
			callback,
			triggerAt: now + delay,
		});
		return handle;
	};

	const clear = (handle: FakeTimerHandle | unknown) => {
		timers.delete(handle as FakeTimerHandle);
	};

	const advance = (ms: number) => {
		now += ms;
		const due = Array.from(timers.entries()).filter(
			([, timer]) => timer.triggerAt <= now
		);

		for (const [handle, timer] of due.sort(
			(a, b) => a[1].triggerAt - b[1].triggerAt
		)) {
			timers.delete(handle);
			timer.callback();
		}
	};

	return {
		now: () => now,
		setTimeout: schedule,
		clearTimeout: clear,
		advance,
	};
}

describe("typing store", () => {
	let timers: ReturnType<typeof createFakeTimers>;
	let store: TypingStore;

	const getEntries = (conversationId: string): TypingEntry[] => {
		const conversation = store.getState().conversations[conversationId];
		return conversation ? Object.values(conversation) : [];
	};

	beforeEach(() => {
		timers = createFakeTimers();
		store = createTypingStore(undefined, {
			now: timers.now,
			setTimeout: timers.setTimeout,
			clearTimeout: timers.clearTimeout,
			defaultTtlMs: 500,
		});
	});

	it("tracks typing state with TTL", () => {
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
			preview: "Hello",
		});

		let entries = getEntries("conv-1");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.preview).toBe("Hello");

		timers.advance(400);
		entries = getEntries("conv-1");
		expect(entries).toHaveLength(1);

		timers.advance(200);
		entries = getEntries("conv-1");
		expect(entries).toHaveLength(0);
	});

	it("removes entries when typing stops", () => {
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
			isTyping: true,
		});

		clearTypingState(store, {
			conversationId: "conv-1",
			actorType: "user",
			actorId: "user-1",
		});

		expect(getEntries("conv-1")).toHaveLength(0);
	});

	it("clears timers when conversation is cleared", () => {
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "ai_agent",
			actorId: "bot-1",
			isTyping: true,
		});

		store.clearConversation("conv-1");
		timers.advance(1000);

		expect(getEntries("conv-1")).toHaveLength(0);
	});

	it("applies realtime events and respects ignore filters", () => {
		const event: RealtimeEvent<"CONVERSATION_TYPING"> = {
			type: "CONVERSATION_TYPING",
			timestamp: Date.now(),
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			payload: {
				websiteId: "site-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				visitorId: "visitor-1",
				userId: null,
				aiAgentId: null,
				visitorPreview: "Hi",
				isTyping: true,
			},
		};

		applyConversationTypingEvent(store, event, {
			ignoreVisitorId: "visitor-1",
		});

		expect(getEntries("conv-1")).toHaveLength(0);

		applyConversationTypingEvent(store, event);
		const entries = getEntries("conv-1");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.preview).toBe("Hi");
	});

	it("clears typing when a message is created", () => {
		setTypingState(store, {
			conversationId: "conv-1",
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
		});

const messageEvent: RealtimeEvent<"MESSAGE_CREATED"> = {
type: "MESSAGE_CREATED",
timestamp: Date.now(),
organizationId: "org-1",
websiteId: "site-1",
visitorId: "visitor-1",
payload: {
conversationId: "conv-1",
websiteId: "site-1",
organizationId: "org-1",
visitorId: "visitor-1",
message: {
id: "msg-1",
					bodyMd: "hello",
					type: "text",
					userId: null,
					aiAgentId: null,
					visitorId: "visitor-1",
					conversationId: "conv-1",
					organizationId: "org-1",
					websiteId: "site-1",
					parentMessageId: null,
					modelUsed: null,
					visibility: "public",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null,
				},
			},
		};

		clearTypingFromMessage(store, messageEvent);
		expect(getEntries("conv-1")).toHaveLength(0);
	});
});
