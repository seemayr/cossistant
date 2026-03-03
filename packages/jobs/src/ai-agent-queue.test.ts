import { describe, expect, it } from "bun:test";
import {
	acquireAiAgentTriggerRunLock,
	isAiAgentTriggerProcessed,
	markAiAgentTriggerProcessed,
	releaseAiAgentTriggerRunLock,
} from "./ai-agent-queue";

class MockRedis {
	private store = new Map<string, string>();

	async set(
		key: string,
		value: string,
		...args: Array<string | number>
	): Promise<"OK" | null> {
		const hasNx = args.includes("NX");
		if (hasNx && this.store.has(key)) {
			return null;
		}

		this.store.set(key, value);
		return "OK";
	}

	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null;
	}

	async eval(
		_script: string,
		_numKeys: number,
		key: string,
		lockValue: string
	): Promise<number> {
		if (this.store.get(key) === lockValue) {
			this.store.delete(key);
			return 1;
		}
		return 0;
	}
}

describe("ai-agent trigger execution state helpers", () => {
	it("acquires a trigger run lock once and blocks concurrent acquisition", async () => {
		const redis = new MockRedis();

		const first = await acquireAiAgentTriggerRunLock(redis as never, {
			conversationId: "conv-1",
			messageId: "msg-1",
			lockValue: "lock-1",
			ttlMs: 60_000,
		});
		const second = await acquireAiAgentTriggerRunLock(redis as never, {
			conversationId: "conv-1",
			messageId: "msg-1",
			lockValue: "lock-2",
			ttlMs: 60_000,
		});

		expect(first).toBe(true);
		expect(second).toBe(false);
	});

	it("releases trigger run lock only when lock value matches", async () => {
		const redis = new MockRedis();
		await acquireAiAgentTriggerRunLock(redis as never, {
			conversationId: "conv-1",
			messageId: "msg-1",
			lockValue: "expected-lock",
			ttlMs: 60_000,
		});

		const wrongRelease = await releaseAiAgentTriggerRunLock(redis as never, {
			conversationId: "conv-1",
			messageId: "msg-1",
			lockValue: "wrong-lock",
		});
		const rightRelease = await releaseAiAgentTriggerRunLock(redis as never, {
			conversationId: "conv-1",
			messageId: "msg-1",
			lockValue: "expected-lock",
		});

		expect(wrongRelease).toBe(false);
		expect(rightRelease).toBe(true);
	});

	it("marks and detects processed triggers", async () => {
		const redis = new MockRedis();

		expect(
			await isAiAgentTriggerProcessed(redis as never, "conv-1", "msg-1")
		).toBe(false);

		await markAiAgentTriggerProcessed(redis as never, {
			conversationId: "conv-1",
			messageId: "msg-1",
			ttlSeconds: 86_400,
		});

		expect(
			await isAiAgentTriggerProcessed(redis as never, "conv-1", "msg-1")
		).toBe(true);
	});
});
