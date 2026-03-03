import type { Redis } from "@cossistant/redis";

const DEFAULT_QUEUE_TTL_SECONDS = 86_400; // 24h
const DEFAULT_WAKE_NEEDED_TTL_SECONDS = 300; // 5m
const ACTIVE_CONVERSATIONS_KEY = "ai-agent:active-conversations";
const WAKE_NEEDED_PREFIX = "ai-agent:wake-needed:";
const TRIGGER_RUN_LOCK_PREFIX = "ai-agent:trigger-processing:";
const TRIGGER_PROCESSED_PREFIX = "ai-agent:trigger-processed:";

const LOCK_RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

const LOCK_RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const TRIGGER_RUN_LOCK_RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

function toScore(createdAt: string | Date | number): number {
	if (typeof createdAt === "number") {
		return createdAt;
	}
	if (createdAt instanceof Date) {
		return createdAt.getTime();
	}
	const parsed = Date.parse(createdAt);
	return Number.isNaN(parsed) ? Date.now() : parsed;
}

export function getAiAgentQueueKey(conversationId: string): string {
	return `ai-agent:queue:${conversationId}`;
}

export function getAiAgentWakeNeededKey(conversationId: string): string {
	return `${WAKE_NEEDED_PREFIX}${conversationId}`;
}

export function getAiAgentActiveConversationsKey(): string {
	return ACTIVE_CONVERSATIONS_KEY;
}

export function getAiAgentLockKey(conversationId: string): string {
	return `ai-agent:lock:${conversationId}`;
}

export function getAiAgentFailureKey(
	conversationId: string,
	messageId: string
): string {
	return `ai-agent:fail:${conversationId}:${messageId}`;
}

export function getAiAgentTriggerRunLockKey(
	conversationId: string,
	messageId: string
): string {
	return `${TRIGGER_RUN_LOCK_PREFIX}${conversationId}:${messageId}`;
}

export function getAiAgentTriggerProcessedKey(
	conversationId: string,
	messageId: string
): string {
	return `${TRIGGER_PROCESSED_PREFIX}${conversationId}:${messageId}`;
}

function getAiAgentFailurePrefix(conversationId: string): string {
	return `ai-agent:fail:${conversationId}:`;
}

export async function enqueueAiAgentMessage(
	redis: Redis,
	params: {
		conversationId: string;
		messageId: string;
		messageCreatedAt: string | Date | number;
		queueTtlSeconds?: number;
	}
): Promise<{ added: boolean }> {
	const queueKey = getAiAgentQueueKey(params.conversationId);
	const queueTtl = params.queueTtlSeconds ?? DEFAULT_QUEUE_TTL_SECONDS;
	const score = toScore(params.messageCreatedAt);

	const pipeline = redis.multi();
	pipeline.zadd(queueKey, "NX", score.toString(), params.messageId);
	pipeline.expire(queueKey, queueTtl);
	pipeline.sadd(ACTIVE_CONVERSATIONS_KEY, params.conversationId);

	const results = await pipeline.exec();
	const zaddResult = results?.[0]?.[1];
	return { added: zaddResult === 1 };
}

export async function peekAiAgentQueue(
	redis: Redis,
	conversationId: string
): Promise<string | null> {
	const queueKey = getAiAgentQueueKey(conversationId);
	const entries = await redis.zrange(queueKey, 0, 0);
	return entries?.[0] ?? null;
}

export async function removeAiAgentQueueMessage(
	redis: Redis,
	conversationId: string,
	messageId: string
): Promise<number> {
	const queueKey = getAiAgentQueueKey(conversationId);
	const removed = await redis.zrem(queueKey, messageId);
	await pruneConversationTracking(redis, conversationId);
	return removed;
}

export async function removeAiAgentQueueMessages(
	redis: Redis,
	conversationId: string,
	messageIds: string[]
): Promise<number> {
	if (messageIds.length === 0) {
		return 0;
	}

	const queueKey = getAiAgentQueueKey(conversationId);
	const removed = await redis.zrem(queueKey, ...messageIds);
	await pruneConversationTracking(redis, conversationId);
	return removed;
}

export async function getAiAgentQueueSize(
	redis: Redis,
	conversationId: string
): Promise<number> {
	const queueKey = getAiAgentQueueKey(conversationId);
	return redis.zcard(queueKey);
}

export async function clearAiAgentConversationQueue(
	redis: Redis,
	conversationId: string
): Promise<number> {
	const queueKey = getAiAgentQueueKey(conversationId);
	const wakeNeededKey = getAiAgentWakeNeededKey(conversationId);
	const removed = await redis.del(queueKey, wakeNeededKey);
	await redis.srem(ACTIVE_CONVERSATIONS_KEY, conversationId);
	return removed;
}

export async function clearAiAgentConversationFailures(
	redis: Redis,
	conversationId: string
): Promise<number> {
	const prefix = getAiAgentFailurePrefix(conversationId);
	const pattern = `${prefix}*`;
	let removed = 0;
	let cursor = "0";

	do {
		const [nextCursor, keys] = (await redis.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			"100"
		)) as [string, string[]];
		cursor = nextCursor;

		if (keys.length > 0) {
			removed += await redis.del(...keys);
		}
	} while (cursor !== "0");

	return removed;
}

export async function isAiAgentWakeNeeded(
	redis: Redis,
	conversationId: string
): Promise<boolean> {
	const wakeKey = getAiAgentWakeNeededKey(conversationId);
	return (await redis.get(wakeKey)) !== null;
}

export async function markAiAgentWakeNeeded(
	redis: Redis,
	params: {
		conversationId: string;
		ttlSeconds?: number;
	}
): Promise<void> {
	const wakeKey = getAiAgentWakeNeededKey(params.conversationId);
	const ttlSeconds = params.ttlSeconds ?? DEFAULT_WAKE_NEEDED_TTL_SECONDS;
	await redis
		.multi()
		.set(wakeKey, "1", "EX", ttlSeconds)
		.sadd(ACTIVE_CONVERSATIONS_KEY, params.conversationId)
		.exec();
}

export async function clearAiAgentWakeNeeded(
	redis: Redis,
	conversationId: string
): Promise<void> {
	await redis.del(getAiAgentWakeNeededKey(conversationId));
}

export async function listAiAgentWakeNeededConversations(
	redis: Redis,
	limit = 100
): Promise<string[]> {
	if (limit <= 0) {
		return [];
	}

	const results: string[] = [];
	let cursor = "0";
	const pattern = `${WAKE_NEEDED_PREFIX}*`;

	do {
		const [nextCursor, keys] = (await redis.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			"100"
		)) as [string, string[]];
		cursor = nextCursor;

		for (const key of keys) {
			results.push(key.slice(WAKE_NEEDED_PREFIX.length));
			if (results.length >= limit) {
				return results;
			}
		}
	} while (cursor !== "0");

	return results;
}

export async function listAiAgentActiveConversations(
	redis: Redis
): Promise<string[]> {
	return redis.smembers(ACTIVE_CONVERSATIONS_KEY);
}

export async function removeAiAgentActiveConversation(
	redis: Redis,
	conversationId: string
): Promise<void> {
	await redis.srem(ACTIVE_CONVERSATIONS_KEY, conversationId);
}

async function pruneConversationTracking(
	redis: Redis,
	conversationId: string
): Promise<void> {
	const queueSize = await getAiAgentQueueSize(redis, conversationId);
	if (queueSize > 0) {
		return;
	}

	await redis
		.multi()
		.srem(ACTIVE_CONVERSATIONS_KEY, conversationId)
		.del(getAiAgentWakeNeededKey(conversationId))
		.exec();
}

export async function acquireAiAgentLock(
	redis: Redis,
	conversationId: string,
	lockValue: string,
	ttlMs: number
): Promise<boolean> {
	const lockKey = getAiAgentLockKey(conversationId);
	const result = await redis.set(lockKey, lockValue, "PX", ttlMs, "NX");
	return result === "OK";
}

export async function renewAiAgentLock(
	redis: Redis,
	conversationId: string,
	lockValue: string,
	ttlMs: number
): Promise<boolean> {
	const lockKey = getAiAgentLockKey(conversationId);
	const result = await redis.eval(
		LOCK_RENEW_SCRIPT,
		1,
		lockKey,
		lockValue,
		ttlMs
	);
	return result === 1;
}

export async function releaseAiAgentLock(
	redis: Redis,
	conversationId: string,
	lockValue: string
): Promise<boolean> {
	const lockKey = getAiAgentLockKey(conversationId);
	const result = await redis.eval(LOCK_RELEASE_SCRIPT, 1, lockKey, lockValue);
	return result === 1;
}

export async function isAiAgentTriggerProcessed(
	redis: Redis,
	conversationId: string,
	messageId: string
): Promise<boolean> {
	const processedKey = getAiAgentTriggerProcessedKey(conversationId, messageId);
	return (await redis.get(processedKey)) !== null;
}

export async function markAiAgentTriggerProcessed(
	redis: Redis,
	params: {
		conversationId: string;
		messageId: string;
		ttlSeconds: number;
	}
): Promise<void> {
	const processedKey = getAiAgentTriggerProcessedKey(
		params.conversationId,
		params.messageId
	);
	await redis.set(processedKey, "1", "EX", params.ttlSeconds);
}

export async function acquireAiAgentTriggerRunLock(
	redis: Redis,
	params: {
		conversationId: string;
		messageId: string;
		lockValue: string;
		ttlMs: number;
	}
): Promise<boolean> {
	const lockKey = getAiAgentTriggerRunLockKey(
		params.conversationId,
		params.messageId
	);
	const result = await redis.set(
		lockKey,
		params.lockValue,
		"PX",
		params.ttlMs,
		"NX"
	);
	return result === "OK";
}

export async function releaseAiAgentTriggerRunLock(
	redis: Redis,
	params: {
		conversationId: string;
		messageId: string;
		lockValue: string;
	}
): Promise<boolean> {
	const lockKey = getAiAgentTriggerRunLockKey(
		params.conversationId,
		params.messageId
	);
	const result = await redis.eval(
		TRIGGER_RUN_LOCK_RELEASE_SCRIPT,
		1,
		lockKey,
		params.lockValue
	);
	return result === 1;
}

export const AI_AGENT_QUEUE_DEFAULTS = {
	queueTtlSeconds: DEFAULT_QUEUE_TTL_SECONDS,
	wakeNeededTtlSeconds: DEFAULT_WAKE_NEEDED_TTL_SECONDS,
};
