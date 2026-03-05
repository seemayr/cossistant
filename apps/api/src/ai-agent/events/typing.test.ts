import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

type TypingEventInput = {
	isTyping: boolean;
};

const emitConversationTypingEventMock = mock((async (
	_payload: TypingEventInput
) => {}) as (payload: TypingEventInput) => Promise<void>);

mock.module("@api/utils/conversation-realtime", () => ({
	emitConversationTypingEvent: emitConversationTypingEventMock,
}));

const typingModulePromise = import("./typing");

type TimerGlobals = {
	setInterval: typeof globalThis.setInterval;
	clearInterval: typeof globalThis.clearInterval;
};

const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

let intervalHandles = new Set<number>();
let nextIntervalHandle = 1;

function createConversation() {
	return {
		id: "conv-1",
		visitorId: "visitor-1",
		websiteId: "site-1",
		organizationId: "org-1",
	};
}

beforeEach(() => {
	emitConversationTypingEventMock.mockReset();
	emitConversationTypingEventMock.mockResolvedValue(undefined);
	intervalHandles = new Set<number>();
	nextIntervalHandle = 1;

	(globalThis as unknown as TimerGlobals).setInterval = (() => {
		const handle = nextIntervalHandle++;
		intervalHandles.add(handle);
		return handle as unknown as ReturnType<typeof setInterval>;
	}) as unknown as typeof setInterval;

	(globalThis as unknown as TimerGlobals).clearInterval = ((
		handle: ReturnType<typeof setInterval>
	) => {
		intervalHandles.delete(Number(handle));
	}) as unknown as typeof clearInterval;
});

afterEach(() => {
	(globalThis as unknown as TimerGlobals).setInterval = originalSetInterval;
	(globalThis as unknown as TimerGlobals).clearInterval = originalClearInterval;
});

describe("TypingHeartbeat", () => {
	it("starts/stops idempotently and clears interval handles", async () => {
		const { TypingHeartbeat } = await typingModulePromise;
		const heartbeat = new TypingHeartbeat({
			conversation: createConversation() as never,
			aiAgentId: "ai-1",
		});

		await heartbeat.start();
		await heartbeat.start();

		expect(heartbeat.running).toBe(true);
		expect(intervalHandles.size).toBe(1);

		await heartbeat.stop();
		await heartbeat.stop();

		expect(heartbeat.running).toBe(false);
		expect(intervalHandles.size).toBe(0);

		const typingStates = emitConversationTypingEventMock.mock.calls.map(
			(call) => (call[0] as { isTyping: boolean }).isTyping
		);
		expect(typingStates).toEqual([true, false]);
	});

	it("does not attach a stale interval when stop is requested during in-flight start", async () => {
		const startGate = {
			release: null as (() => void) | null,
		};
		let shouldBlockFirstStart = true;
		emitConversationTypingEventMock.mockImplementation(
			async (payload: TypingEventInput) => {
				if (payload.isTyping && shouldBlockFirstStart) {
					shouldBlockFirstStart = false;
					await new Promise<void>((resolve) => {
						startGate.release = resolve;
					});
				}
			}
		);

		const { TypingHeartbeat } = await typingModulePromise;
		const heartbeat = new TypingHeartbeat({
			conversation: createConversation() as never,
			aiAgentId: "ai-1",
		});

		const startPromise = heartbeat.start();
		await Promise.resolve();
		const stopPromise = heartbeat.stop();
		startGate.release?.();
		await Promise.all([startPromise, stopPromise]);

		expect(heartbeat.running).toBe(false);
		expect(intervalHandles.size).toBe(0);

		const typingStates = emitConversationTypingEventMock.mock.calls.map(
			(call) => (call[0] as { isTyping: boolean }).isTyping
		);
		expect(typingStates).toContain(true);
		expect(typingStates).toContain(false);
	});
});
