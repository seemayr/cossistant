/**
 * AI Agent Worker
 *
 * BullMQ worker that processes AI agent jobs through the 5-step pipeline.
 * Built for reliability and scale with proper retry handling.
 *
 * The pipeline:
 * 1. Intake - Gather context, validate
 * 2. Decision - Should AI act?
 * 3. Generation - Generate response
 * 4. Execution - Execute actions
 * 5. Followup - Cleanup, analysis
 */

import { runAiAgentPipeline } from "@api/ai-agent";
import {
	isAiPausedForConversation,
	isAiPausedInRedis,
} from "@api/ai-agent/kill-switch";
import {
	markConversationAsSeen,
	updateConversationAiCursor,
} from "@api/db/mutations/conversation";
import { getActiveAiAgentForWebsite } from "@api/db/queries/ai-agent";
import {
	getConversationById,
	getConversationMessagesAfterCursor,
	getMessageMetadata,
} from "@api/db/queries/conversation";
import { emitConversationSeenEvent } from "@api/utils/conversation-realtime";
import {
	AI_AGENT_JOB_OPTIONS,
	type AiAgentJobData,
	acquireAiAgentLock,
	acquireAiAgentTriggerRunLock,
	clearAiAgentWakeNeeded,
	enqueueAiAgentMessage,
	generateAiAgentJobId,
	getAiAgentFailureKey,
	getAiAgentQueueSize,
	isAiAgentTriggerProcessed,
	isAiAgentWakeNeeded,
	listAiAgentActiveConversations,
	listAiAgentWakeNeededConversations,
	markAiAgentTriggerProcessed,
	markAiAgentWakeNeeded,
	peekAiAgentQueue,
	QUEUE_NAMES,
	releaseAiAgentLock,
	releaseAiAgentTriggerRunLock,
	removeAiAgentActiveConversation,
	removeAiAgentQueueMessage,
	renewAiAgentLock,
} from "@cossistant/jobs";
import {
	getSafeRedisUrl,
	type Redis,
	type RedisOptions,
} from "@cossistant/redis";
import { db } from "@workers/db";
import { env } from "@workers/env";
import { type Job, Queue, QueueEvents, Worker } from "bullmq";
import { isTriggerableMessage } from "./coalescing";
import { resolvePipelineFailureAction } from "./failure-policy";
import { runWithWorkflowStartedEvent } from "./workflow-events";

/**
 * Worker configuration for reliability
 */
const WORKER_CONFIG = {
	concurrency: env.AI_AGENT_CONCURRENCY,
	lockDuration: env.AI_AGENT_LOCK_DURATION_MS,
	stalledInterval: env.AI_AGENT_STALLED_INTERVAL_MS,
	maxStalledCount: env.AI_AGENT_MAX_STALLED_COUNT,
};

type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
	stateRedis: Redis;
};

async function sleep(ms: number): Promise<void> {
	if (ms <= 0) {
		return;
	}

	await new Promise((resolve) => setTimeout(resolve, ms));
}

type AiCursor = {
	createdAt: string | null;
	messageId: string | null;
};

type CursorComparableMessage = {
	id: string;
	createdAt: string;
};

function isMessageAtOrBeforeCursor(
	message: CursorComparableMessage,
	cursor: AiCursor
): boolean {
	if (!(cursor.createdAt && cursor.messageId)) {
		return false;
	}

	const messageMs = Date.parse(message.createdAt);
	const cursorMs = Date.parse(cursor.createdAt);

	if (!(Number.isNaN(messageMs) || Number.isNaN(cursorMs))) {
		if (messageMs < cursorMs) {
			return true;
		}
		if (messageMs > cursorMs) {
			return false;
		}
	}

	return message.id <= cursor.messageId;
}

function advanceCursor(
	_cursor: AiCursor,
	message: CursorComparableMessage
): AiCursor {
	return {
		createdAt: message.createdAt,
		messageId: message.id,
	};
}

export function createAiAgentWorker({
	connectionOptions,
	redisUrl,
	stateRedis,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.AI_AGENT;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);
	let worker: Worker<AiAgentJobData> | null = null;
	let events: QueueEvents | null = null;
	let wakeQueue: Queue<AiAgentJobData> | null = null;
	let wakeSweepTimer: ReturnType<typeof setInterval> | null = null;

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

	async function acquireSweepLease(redis: Redis): Promise<boolean> {
		const result = await redis.set(
			WAKE_SWEEP_LOCK_KEY,
			String(Date.now()),
			"PX",
			WAKE_SWEEP_LOCK_TTL_MS,
			"NX"
		);
		return result === "OK";
	}

	async function runWakeSweeper(redis: Redis): Promise<void> {
		if (!(await acquireSweepLease(redis))) {
			return;
		}

		const [wakeNeededConversations, activeConversations] = await Promise.all([
			listAiAgentWakeNeededConversations(redis, 500),
			listAiAgentActiveConversations(redis),
		]);
		const wakeNeededSet = new Set(wakeNeededConversations);
		const activeOnlyConversations = activeConversations.filter(
			(conversationId) => !wakeNeededSet.has(conversationId)
		);
		const orderedConversationIds = [
			...wakeNeededConversations,
			...activeOnlyConversations,
		];

		for (const conversationId of orderedConversationIds) {
			const queueSize = await getAiAgentQueueSize(redis, conversationId);
			if (queueSize === 0) {
				await Promise.all([
					removeAiAgentActiveConversation(redis, conversationId),
					clearAiAgentWakeNeeded(redis, conversationId),
				]);
				continue;
			}

			const wakeMarked = await isAiAgentWakeNeeded(redis, conversationId);
			if (wakeQueue) {
				const existingJob = await wakeQueue.getJob(
					generateAiAgentJobId(conversationId)
				);
				if (existingJob) {
					const existingState = await existingJob.getState();
					if (existingState === "waiting" || existingState === "delayed") {
						if (wakeMarked) {
							await clearAiAgentWakeNeeded(redis, conversationId);
						}
						continue;
					}

					if (existingState === "active") {
						continue;
					}
				}
			}

			try {
				await ensureConversationWake({
					redis,
					conversationId,
					reason: "sweeper",
					currentJobId: "__wake_sweeper__",
				});
			} catch (error) {
				await markAiAgentWakeNeeded(redis, { conversationId });
				console.error(
					`[worker:ai-agent] conv=${conversationId} | Sweeper failed to recover wake`,
					error
				);
			}
		}
	}

	const controller = {
		start: async () => {
			if (worker) {
				return;
			}

			console.log(
				`[worker:ai-agent] Using queue=${queueName} redis=${safeRedisUrl}`
			);

			// Producer-side queue handle used for continuation wake jobs
			wakeQueue = new Queue<AiAgentJobData>(queueName, {
				connection: buildConnectionOptions(),
				defaultJobOptions: {
					removeOnComplete: { count: 1000 },
					removeOnFail: { count: 5000 },
				},
			});
			await wakeQueue.waitUntilReady();

			// Queue events for monitoring (only errors and stalled jobs)
			events = new QueueEvents(queueName, {
				connection: buildConnectionOptions(),
			});
			events.on("failed", ({ jobId, failedReason }) => {
				console.error(`[worker:ai-agent] Job ${jobId} failed: ${failedReason}`);
			});
			events.on("stalled", ({ jobId }) => {
				console.warn(`[worker:ai-agent] Job ${jobId} stalled`);
			});

			await events.waitUntilReady();

			// Main worker
			worker = new Worker<AiAgentJobData>(
				queueName,
				async (job: Job<AiAgentJobData>) => {
					const start = Date.now();

					try {
						await processAiAgentJob(stateRedis, job);
					} catch (error) {
						const duration = Date.now() - start;
						console.error(
							`[worker:ai-agent] Job ${job.id} failed after ${duration}ms`,
							error
						);
						throw error;
					}
				},
				{
					connection: buildConnectionOptions(),
					concurrency: WORKER_CONFIG.concurrency,
					lockDuration: WORKER_CONFIG.lockDuration,
					stalledInterval: WORKER_CONFIG.stalledInterval,
					maxStalledCount: WORKER_CONFIG.maxStalledCount,
				}
			);

			worker.on("error", (error) => {
				console.error("[worker:ai-agent] Worker error", error);
			});

			await worker.waitUntilReady();
			console.log(
				`[worker:ai-agent] Worker started with concurrency=${WORKER_CONFIG.concurrency}`
			);

			wakeSweepTimer = setInterval(() => {
				runWakeSweeper(stateRedis).catch((error) => {
					console.error(
						"[worker:ai-agent] Wake sweeper iteration failed",
						error
					);
				});
			}, WAKE_SWEEP_INTERVAL_MS);
			wakeSweepTimer.unref?.();

			await runWakeSweeper(stateRedis).catch((error) => {
				console.error(
					"[worker:ai-agent] Wake sweeper startup run failed",
					error
				);
			});
		},
		stop: async () => {
			if (wakeSweepTimer) {
				clearInterval(wakeSweepTimer);
				wakeSweepTimer = null;
			}
			await Promise.all([
				(async () => {
					if (worker) {
						await worker.close();
						worker = null;
						console.log("[worker:ai-agent] Worker stopped");
					}
				})(),
				(async () => {
					if (events) {
						await events.close();
						events = null;
						console.log("[worker:ai-agent] Queue events stopped");
					}
				})(),
				(async () => {
					if (wakeQueue) {
						await wakeQueue.close();
						wakeQueue = null;
						console.log("[worker:ai-agent] Wake queue handle closed");
					}
				})(),
			]);
		},
	};

	const DRAIN_MAX_MESSAGES = env.AI_AGENT_DRAIN_MAX_MESSAGES;
	const DRAIN_MAX_RUNTIME_MS = env.AI_AGENT_DRAIN_MAX_RUNTIME_MS;
	const DRAIN_LOCK_TTL_MS = env.AI_AGENT_DRAIN_LOCK_TTL_MS;
	const TRIGGER_RUN_LOCK_TTL_MS = env.AI_AGENT_TRIGGER_RUN_LOCK_TTL_MS;
	const TRIGGER_PROCESSED_TTL_SECONDS =
		env.AI_AGENT_TRIGGER_PROCESSED_TTL_SECONDS;
	const STRICT_FIFO = env.AI_AGENT_STRICT_FIFO;
	const WAKE_SWEEP_INTERVAL_MS = env.AI_AGENT_WAKE_SWEEP_INTERVAL_MS;
	const WAKE_RECOVERY_JITTER_MS = env.AI_AGENT_WAKE_RECOVERY_JITTER_MS;
	const WAKE_SWEEP_LOCK_KEY = "ai-agent:wake-sweep-lock";
	const WAKE_SWEEP_LOCK_TTL_MS = Math.max(
		5000,
		Math.floor(WAKE_SWEEP_INTERVAL_MS * 0.9)
	);
	const FAILURE_THRESHOLD = 3;
	const FAILURE_TTL_SECONDS = 60 * 60;

	async function hydrateQueueFromCursor(
		redis: Redis,
		conversation: Awaited<ReturnType<typeof getConversationById>>
	): Promise<void> {
		if (!conversation) {
			return;
		}

		let afterCreatedAt =
			conversation.aiAgentLastProcessedMessageCreatedAt ?? null;
		let afterId = conversation.aiAgentLastProcessedMessageId ?? null;
		const pageSize = 500;

		while (true) {
			const rows = await getConversationMessagesAfterCursor(db, {
				organizationId: conversation.organizationId,
				conversationId: conversation.id,
				afterCreatedAt,
				afterId,
				limit: pageSize,
			});

			if (rows.length === 0) {
				break;
			}

			for (const row of rows) {
				await enqueueAiAgentMessage(redis, {
					conversationId: conversation.id,
					messageId: row.id,
					messageCreatedAt: row.createdAt,
				});
			}

			if (rows.length < pageSize) {
				break;
			}

			const last = rows.at(-1);
			if (!last) {
				break;
			}
			afterCreatedAt = last.createdAt;
			afterId = last.id;
		}
	}

	async function requeueDrainJob(params: {
		jobData: AiAgentJobData;
		triggerMessageId: string;
		currentJobId: string;
		delayMs?: number;
	}): Promise<"scheduled" | "already_waiting" | "already_active"> {
		if (!wakeQueue) {
			throw new Error("Wake queue not ready");
		}

		const wakeData: AiAgentJobData = {
			conversationId: params.jobData.conversationId,
			websiteId: params.jobData.websiteId,
			organizationId: params.jobData.organizationId,
			aiAgentId: params.jobData.aiAgentId,
			triggerMessageId: params.triggerMessageId,
		};
		const jobId = generateAiAgentJobId(
			params.jobData.conversationId,
			params.triggerMessageId
		);

		const existingJob = await wakeQueue.getJob(jobId);
		if (existingJob) {
			const existingState = await existingJob.getState();
			if (
				existingState === "completed" ||
				existingState === "failed" ||
				existingState === "delayed" ||
				existingState === "waiting"
			) {
				await existingJob.remove();
				console.log(
					`[worker:ai-agent] conv=${params.jobData.conversationId} | Replacing ${existingState} wake job`
				);
			} else if (existingState === "active") {
				console.log(
					`[worker:ai-agent] conv=${params.jobData.conversationId} | Active wake present (job=${existingJob.id}, current=${params.currentJobId})`
				);
				return String(existingJob.id) === params.currentJobId
					? "already_waiting"
					: "already_active";
			} else {
				console.warn(
					`[worker:ai-agent] conv=${params.jobData.conversationId} | Unexpected wake state ${existingState}; keeping existing wake`
				);
				return "already_waiting";
			}
		}

		const delayMs = params.delayMs ?? AI_AGENT_JOB_OPTIONS.delay ?? 0;
		await wakeQueue.add("ai-agent", wakeData, {
			...AI_AGENT_JOB_OPTIONS,
			delay: delayMs,
			jobId,
		});
		await clearAiAgentWakeNeeded(stateRedis, params.jobData.conversationId);

		console.log(
			`[worker:ai-agent] conv=${params.jobData.conversationId} | Scheduled continuation drain for trigger ${params.triggerMessageId} | delayMs=${delayMs}`
		);
		return "scheduled";
	}

	function getRecoveryDelayMs(): number {
		if (WAKE_RECOVERY_JITTER_MS <= 0) {
			return 0;
		}

		return Math.floor(Math.random() * (WAKE_RECOVERY_JITTER_MS + 1));
	}

	async function buildRecoveryJobData(
		conversationId: string
	): Promise<AiAgentJobData | null> {
		const conversation = await getConversationById(db, { conversationId });
		if (!conversation) {
			return null;
		}

		const activeAiAgent = await getActiveAiAgentForWebsite(db, {
			websiteId: conversation.websiteId,
			organizationId: conversation.organizationId,
		});
		if (!activeAiAgent) {
			return null;
		}

		return {
			conversationId: conversation.id,
			websiteId: conversation.websiteId,
			organizationId: conversation.organizationId,
			aiAgentId: activeAiAgent.id,
		};
	}

	async function ensureConversationWake(params: {
		redis: Redis;
		conversationId: string;
		reason: "lock_miss" | "lock_lost" | "end_invariant" | "sweeper";
		currentJobId: string;
	}): Promise<"scheduled" | "already_running" | "skipped"> {
		const nextTriggerMessageId = await peekAiAgentQueue(
			params.redis,
			params.conversationId
		);
		if (!nextTriggerMessageId) {
			await Promise.all([
				removeAiAgentActiveConversation(params.redis, params.conversationId),
				clearAiAgentWakeNeeded(params.redis, params.conversationId),
			]);
			return "skipped";
		}

		const jobData = await buildRecoveryJobData(params.conversationId);
		if (!jobData) {
			await markAiAgentWakeNeeded(params.redis, {
				conversationId: params.conversationId,
			});
			console.warn(
				`[worker:ai-agent] conv=${params.conversationId} | Unable to build recovery wake payload (${params.reason})`
			);
			return "skipped";
		}

		let result: Awaited<ReturnType<typeof requeueDrainJob>>;
		try {
			result = await requeueDrainJob({
				jobData,
				triggerMessageId: nextTriggerMessageId,
				currentJobId: params.currentJobId,
				delayMs: getRecoveryDelayMs(),
			});
		} catch (error) {
			await markAiAgentWakeNeeded(params.redis, {
				conversationId: params.conversationId,
			});
			throw error;
		}
		logWorkerTrace({
			conversationId: params.conversationId,
			event: "worker.wake.ensure.result",
			fields: `reason=${params.reason} | result=${result}`,
		});

		if (result === "already_active" || result === "already_waiting") {
			return "already_running";
		}

		return "scheduled";
	}

	async function hasRunnableWake(params: {
		conversationId: string;
		currentJobId?: string;
	}): Promise<boolean> {
		if (!wakeQueue) {
			return false;
		}

		const existingJob = await wakeQueue.getJob(
			generateAiAgentJobId(params.conversationId)
		);
		if (!existingJob) {
			return false;
		}

		const state = await existingJob.getState();
		if (state === "waiting" || state === "delayed") {
			return true;
		}

		if (state === "active") {
			return !(
				params.currentJobId && String(existingJob.id) === params.currentJobId
			);
		}

		return false;
	}

	async function dropQueuedBacklogWhilePaused(params: {
		redis: Redis;
		conversation: NonNullable<Awaited<ReturnType<typeof getConversationById>>>;
		cursor: AiCursor;
	}): Promise<number> {
		let droppedCount = 0;
		let cursor = params.cursor;

		while (true) {
			const nextMessageId = await peekAiAgentQueue(
				params.redis,
				params.conversation.id
			);
			if (!nextMessageId) {
				break;
			}

			const metadata = await getMessageMetadata(db, {
				messageId: nextMessageId,
				organizationId: params.conversation.organizationId,
			});

			const removableMessageId = metadata?.id ?? nextMessageId;
			await removeAiAgentQueueMessage(
				params.redis,
				params.conversation.id,
				removableMessageId
			);
			droppedCount++;

			if (!(metadata && isTriggerableMessage(metadata))) {
				continue;
			}

			if (isMessageAtOrBeforeCursor(metadata, cursor)) {
				continue;
			}

			await updateConversationAiCursor(db, {
				conversationId: params.conversation.id,
				organizationId: params.conversation.organizationId,
				messageId: metadata.id,
				messageCreatedAt: metadata.createdAt,
			});
			cursor = advanceCursor(cursor, metadata);
		}

		await Promise.all([
			removeAiAgentActiveConversation(params.redis, params.conversation.id),
			clearAiAgentWakeNeeded(params.redis, params.conversation.id),
		]);

		return droppedCount;
	}

	async function recordMessageFailure(
		redis: Redis,
		conversationId: string,
		messageId: string
	): Promise<number> {
		const key = getAiAgentFailureKey(conversationId, messageId);
		const count = await redis.incr(key);
		if (count === 1) {
			await redis.expire(key, FAILURE_TTL_SECONDS);
		}
		return count;
	}

	function logTriggerState(params: {
		conversationId: string;
		triggerMessageId: string;
		jobId: string;
		attempt: number;
		state: "processing" | "processed" | "skipped_due_lock" | "pipeline_run";
		notes?: string;
	}): void {
		const suffix = params.notes ? ` | ${params.notes}` : "";
		console.log(
			`[worker:ai-agent] conv=${params.conversationId} | trigger=${params.triggerMessageId} | jobId=${params.jobId} | attempt=${params.attempt} | state=${params.state}${suffix}`
		);
	}

	function logWorkerTrace(params: {
		conversationId: string;
		event: string;
		fields?: string;
	}): void {
		if (!env.AI_AGENT_WORKER_DEEP_TRACE_ENABLED) {
			return;
		}
		console.log(
			`[worker:ai-agent:trace] conv=${params.conversationId} | ${params.event}${params.fields ? ` | ${params.fields}` : ""}`
		);
	}

	/**
	 * Process an AI agent job through the pipeline
	 */
	async function processAiAgentJob(
		redis: Redis,
		job: Job<AiAgentJobData>
	): Promise<void> {
		const { conversationId, aiAgentId } = job.data;
		const lockValue = String(job.id ?? `job-${Date.now()}`);
		const lockAcquireStart = Date.now();
		logWorkerTrace({
			conversationId,
			event: "worker.lock.acquire.start",
			fields: `jobId=${job.id ?? "unknown"} | ttlMs=${DRAIN_LOCK_TTL_MS}`,
		});
		const lockAcquired = await acquireAiAgentLock(
			redis,
			conversationId,
			lockValue,
			DRAIN_LOCK_TTL_MS
		);
		logWorkerTrace({
			conversationId,
			event: "worker.lock.acquire.end",
			fields: `jobId=${job.id ?? "unknown"} | acquired=${lockAcquired} | durationMs=${Date.now() - lockAcquireStart}`,
		});

		if (!lockAcquired) {
			await ensureConversationWake({
				redis,
				conversationId,
				reason: "lock_miss",
				currentJobId: String(job.id ?? "__lock_miss__"),
			});
			return;
		}

		let lockLost = false;
		let stopLockWatchdog = false;
		const lockRenewIntervalMs = Math.max(
			250,
			Math.floor(DRAIN_LOCK_TTL_MS / 3)
		);
		const lockWatchdog = (async () => {
			while (!stopLockWatchdog) {
				await sleep(lockRenewIntervalMs);
				if (stopLockWatchdog) {
					break;
				}

				try {
					const renewStart = Date.now();
					const renewed = await renewAiAgentLock(
						redis,
						conversationId,
						lockValue,
						DRAIN_LOCK_TTL_MS
					);
					logWorkerTrace({
						conversationId,
						event: "worker.lock.renew",
						fields: `renewed=${renewed} | durationMs=${Date.now() - renewStart}`,
					});
					if (!renewed) {
						lockLost = true;
						console.error(
							`[worker:ai-agent] conv=${conversationId} | Conversation lock lease lost during processing`
						);
						break;
					}
				} catch (error) {
					lockLost = true;
					console.error(
						`[worker:ai-agent] conv=${conversationId} | Lock watchdog renewal failed`,
						error
					);
					break;
				}
			}
		})();

		try {
			// Get conversation for emitting events and cursor state
			const conversationLookupStart = Date.now();
			const conversation = await getConversationById(db, { conversationId });
			logWorkerTrace({
				conversationId,
				event: "worker.conversation.lookup",
				fields: `found=${Boolean(conversation)} | durationMs=${Date.now() - conversationLookupStart}`,
			});

			if (!conversation) {
				console.error(`[worker:ai-agent] conv=${conversationId} | Not found`);
				await removeAiAgentActiveConversation(redis, conversationId);
				await clearAiAgentWakeNeeded(redis, conversationId);
				return;
			}

			const pausedCheckStart = Date.now();
			const pausedAtStart = await isAiPausedForConversation({
				db,
				redis,
				conversationId,
				fallbackPausedUntil: conversation.aiPausedUntil,
				skipDbLookup: true,
			});
			logWorkerTrace({
				conversationId,
				event: "worker.pause.check.start",
				fields: `paused=${pausedAtStart} | durationMs=${Date.now() - pausedCheckStart}`,
			});
			if (pausedAtStart) {
				const dropped = await dropQueuedBacklogWhilePaused({
					redis,
					conversation,
					cursor: {
						createdAt:
							conversation.aiAgentLastProcessedMessageCreatedAt ?? null,
						messageId: conversation.aiAgentLastProcessedMessageId ?? null,
					},
				});
				console.log(
					`[worker:ai-agent] conv=${conversationId} | AI paused, dropped queued backlog count=${dropped}`
				);
				return;
			}

			// Emit seen event once per drain run
			const actor = { type: "ai_agent" as const, aiAgentId };
			const lastSeenAt = await markConversationAsSeen(db, {
				conversation,
				actor,
			});

			await emitConversationSeenEvent({
				conversation,
				actor,
				lastSeenAt,
			});

			const hydrateStart = Date.now();
			await hydrateQueueFromCursor(redis, conversation);
			logWorkerTrace({
				conversationId,
				event: "worker.queue.hydrate_from_cursor",
				fields: `durationMs=${Date.now() - hydrateStart}`,
			});
			let cursor: AiCursor = {
				createdAt: conversation.aiAgentLastProcessedMessageCreatedAt ?? null,
				messageId: conversation.aiAgentLastProcessedMessageId ?? null,
			};

			const drainStart = Date.now();
			let processed = 0;
			let iteration = 0;
			if (!STRICT_FIFO) {
				console.warn(
					"[worker:ai-agent] STRICT_FIFO=false is deprecated. Worker still enforces strict FIFO."
				);
			}

			while (true) {
				iteration += 1;
				logWorkerTrace({
					conversationId,
					event: "worker.loop.iteration.start",
					fields: `iteration=${iteration} | processed=${processed} | elapsedMs=${Date.now() - drainStart}`,
				});
				if (lockLost) {
					console.error(
						`[worker:ai-agent] conv=${conversationId} | Lock lease lost, stopping drain loop before next trigger`
					);
					await ensureConversationWake({
						redis,
						conversationId,
						reason: "lock_lost",
						currentJobId: String(job.id ?? "__lock_lost__"),
					});
					logWorkerTrace({
						conversationId,
						event: "worker.loop.breakReason",
						fields: "reason=lock_lost",
					});
					break;
				}
				if (processed >= DRAIN_MAX_MESSAGES) {
					logWorkerTrace({
						conversationId,
						event: "worker.loop.breakReason",
						fields: `reason=drain_max_messages | processed=${processed}`,
					});
					break;
				}
				if (Date.now() - drainStart >= DRAIN_MAX_RUNTIME_MS) {
					logWorkerTrace({
						conversationId,
						event: "worker.loop.breakReason",
						fields: `reason=drain_max_runtime | elapsedMs=${Date.now() - drainStart}`,
					});
					break;
				}
				if (await isAiPausedInRedis(redis, conversationId)) {
					const dropped = await dropQueuedBacklogWhilePaused({
						redis,
						conversation,
						cursor,
					});
					console.log(
						`[worker:ai-agent] conv=${conversationId} | AI paused during drain, dropped queued backlog count=${dropped}`
					);
					return;
				}

				const queuePeekStart = Date.now();
				const nextMessageId = await peekAiAgentQueue(redis, conversationId);
				logWorkerTrace({
					conversationId,
					event: "worker.queue.peek",
					fields: `nextMessageId=${nextMessageId ?? "none"} | durationMs=${Date.now() - queuePeekStart}`,
				});

				if (!nextMessageId) {
					logWorkerTrace({
						conversationId,
						event: "worker.loop.breakReason",
						fields: "reason=queue_empty",
					});
					break;
				}

				const metadataLookupStart = Date.now();
				const messageMetadata = await getMessageMetadata(db, {
					messageId: nextMessageId,
					organizationId: conversation.organizationId,
				});
				logWorkerTrace({
					conversationId,
					event: "worker.message_metadata.lookup",
					fields: `messageId=${nextMessageId} | found=${Boolean(messageMetadata)} | durationMs=${Date.now() - metadataLookupStart}`,
				});

				if (!messageMetadata) {
					console.warn(
						`[worker:ai-agent] conv=${conversationId} | Message ${nextMessageId} not found, skipping`
					);
					await removeAiAgentQueueMessage(redis, conversationId, nextMessageId);
					processed++;
					continue;
				}
				if (!isTriggerableMessage(messageMetadata)) {
					console.warn(
						`[worker:ai-agent] conv=${conversationId} | Message ${messageMetadata.id} is not triggerable, dropping`
					);
					await removeAiAgentQueueMessage(
						redis,
						conversationId,
						messageMetadata.id
					);
					processed++;
					continue;
				}

				if (isMessageAtOrBeforeCursor(messageMetadata, cursor)) {
					console.log(
						`[worker:ai-agent] conv=${conversationId} | Message ${messageMetadata.id} is stale vs cursor (${cursor.messageId}), dropping`
					);
					await removeAiAgentQueueMessage(
						redis,
						conversationId,
						messageMetadata.id
					);
					processed++;
					continue;
				}

				const triggerMessageId = messageMetadata.id;
				const workerJobId = String(job.id ?? `job-${Date.now()}`);
				const attempt = job.attemptsMade + 1;

				const triggerAlreadyProcessed = await isAiAgentTriggerProcessed(
					redis,
					conversationId,
					triggerMessageId
				);
				if (triggerAlreadyProcessed) {
					logTriggerState({
						conversationId,
						triggerMessageId,
						jobId: workerJobId,
						attempt,
						state: "processed",
						notes: "housekeeping_only",
					});
					const housekeepingStart = Date.now();
					await updateConversationAiCursor(db, {
						conversationId,
						organizationId: conversation.organizationId,
						messageId: triggerMessageId,
						messageCreatedAt: messageMetadata.createdAt,
					});
					cursor = advanceCursor(cursor, messageMetadata);
					await removeAiAgentQueueMessage(
						redis,
						conversationId,
						triggerMessageId
					);
					logWorkerTrace({
						conversationId,
						event: "worker.housekeeping_only",
						fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | durationMs=${Date.now() - housekeepingStart}`,
					});
					processed++;
					continue;
				}

				const triggerLockValue = `${workerJobId}:${triggerMessageId}:${Date.now()}`;
				const triggerLockStart = Date.now();
				const triggerLockAcquired = await acquireAiAgentTriggerRunLock(redis, {
					conversationId,
					messageId: triggerMessageId,
					lockValue: triggerLockValue,
					ttlMs: TRIGGER_RUN_LOCK_TTL_MS,
				});
				logWorkerTrace({
					conversationId,
					event: "worker.trigger_lock.acquire",
					fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | acquired=${triggerLockAcquired} | ttlMs=${TRIGGER_RUN_LOCK_TTL_MS} | durationMs=${Date.now() - triggerLockStart}`,
				});

				if (!triggerLockAcquired) {
					logTriggerState({
						conversationId,
						triggerMessageId,
						jobId: workerJobId,
						attempt,
						state: "skipped_due_lock",
					});
					break;
				}

				logTriggerState({
					conversationId,
					triggerMessageId,
					jobId: workerJobId,
					attempt,
					state: "processing",
				});

				try {
					const workflowRunId = `ai-msg-${triggerMessageId}`;
					const pipelineStart = Date.now();

					let result: Awaited<ReturnType<typeof runAiAgentPipeline>>;
					try {
						logTriggerState({
							conversationId,
							triggerMessageId,
							jobId: workerJobId,
							attempt,
							state: "pipeline_run",
						});
						logWorkerTrace({
							conversationId,
							event: "worker.pipeline.start",
							fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt}`,
						});
						result = await runWithWorkflowStartedEvent({
							event: {
								conversation,
								aiAgentId,
								workflowRunId,
								triggerMessageId,
							},
							run: () =>
								runAiAgentPipeline({
									db,
									input: {
										conversationId,
										messageId: triggerMessageId,
										messageCreatedAt: messageMetadata.createdAt,
										websiteId: conversation.websiteId,
										organizationId: conversation.organizationId,
										visitorId: conversation.visitorId,
										aiAgentId,
										workflowRunId,
										jobId: workerJobId,
									},
								}),
						});
						logWorkerTrace({
							conversationId,
							event: "worker.pipeline.end",
							fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | status=${result.status} | retryable=${result.retryable} | publicMessagesSent=${result.publicMessagesSent} | durationMs=${Date.now() - pipelineStart}`,
						});
					} catch (error) {
						console.error(
							`[worker:ai-agent] conv=${conversationId} | Pipeline threw unexpectedly for message ${triggerMessageId}`,
							error
						);
						result = {
							status: "error",
							error: error instanceof Error ? error.message : "Pipeline threw",
							publicMessagesSent: 0,
							retryable: true,
							metrics: {
								intakeMs: 0,
								decisionMs: 0,
								generationMs: 0,
								executionMs: 0,
								followupMs: 0,
								totalMs: 0,
							},
						};
						logWorkerTrace({
							conversationId,
							event: "worker.pipeline.end",
							fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | status=error_thrown | durationMs=${Date.now() - pipelineStart}`,
						});
					}

					if (lockLost) {
						console.error(
							`[worker:ai-agent] conv=${conversationId} | Lock lease lost after pipeline run, skipping queue mutation`
						);
						await ensureConversationWake({
							redis,
							conversationId,
							reason: "lock_lost",
							currentJobId: String(job.id ?? "__lock_lost_after_pipeline__"),
						});
						break;
					}

					if (result.status === "error") {
						const failureCount = await recordMessageFailure(
							redis,
							conversationId,
							triggerMessageId
						);
						const failureAction = resolvePipelineFailureAction({
							retryable: result.retryable,
							failureCount,
							failureThreshold: FAILURE_THRESHOLD,
						});

						if (failureAction === "drop") {
							const processedMarkerStart = Date.now();
							await markAiAgentTriggerProcessed(redis, {
								conversationId,
								messageId: triggerMessageId,
								ttlSeconds: TRIGGER_PROCESSED_TTL_SECONDS,
							});
							logWorkerTrace({
								conversationId,
								event: "worker.trigger_processed.write",
								fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | mode=non_retryable_drop | durationMs=${Date.now() - processedMarkerStart}`,
							});
							logTriggerState({
								conversationId,
								triggerMessageId,
								jobId: workerJobId,
								attempt,
								state: "processed",
								notes: "dropped_after_non_retryable_error",
							});
							console.error(
								`[worker:ai-agent] conv=${conversationId} | Message ${triggerMessageId} failed ${failureCount} times (retryable=${result.retryable}, publicMessagesSent=${result.publicMessagesSent}), dropping`
							);
							const cursorAndQueueStart = Date.now();
							await updateConversationAiCursor(db, {
								conversationId,
								organizationId: conversation.organizationId,
								messageId: triggerMessageId,
								messageCreatedAt: messageMetadata.createdAt,
							});
							cursor = advanceCursor(cursor, messageMetadata);
							await removeAiAgentQueueMessage(
								redis,
								conversationId,
								triggerMessageId
							);
							logWorkerTrace({
								conversationId,
								event: "worker.cursor_and_queue_update",
								fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | mode=non_retryable_drop | durationMs=${Date.now() - cursorAndQueueStart}`,
							});
							processed++;
							continue;
						}

						console.warn(
							`[worker:ai-agent] conv=${conversationId} | Message ${triggerMessageId} failed (${failureCount}/${FAILURE_THRESHOLD}), keeping queued for retry`
						);
						break;
					}

					const processedMarkerStart = Date.now();
					await markAiAgentTriggerProcessed(redis, {
						conversationId,
						messageId: triggerMessageId,
						ttlSeconds: TRIGGER_PROCESSED_TTL_SECONDS,
					});
					logWorkerTrace({
						conversationId,
						event: "worker.trigger_processed.write",
						fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | mode=success | durationMs=${Date.now() - processedMarkerStart}`,
					});
					logTriggerState({
						conversationId,
						triggerMessageId,
						jobId: workerJobId,
						attempt,
						state: "processed",
					});
					const cursorAndQueueStart = Date.now();
					await updateConversationAiCursor(db, {
						conversationId,
						organizationId: conversation.organizationId,
						messageId: triggerMessageId,
						messageCreatedAt: messageMetadata.createdAt,
					});
					cursor = advanceCursor(cursor, messageMetadata);
					await removeAiAgentQueueMessage(
						redis,
						conversationId,
						triggerMessageId
					);
					logWorkerTrace({
						conversationId,
						event: "worker.cursor_and_queue_update",
						fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | mode=success | durationMs=${Date.now() - cursorAndQueueStart}`,
					});
					processed++;
				} finally {
					const releaseStart = Date.now();
					const released = await releaseAiAgentTriggerRunLock(redis, {
						conversationId,
						messageId: triggerMessageId,
						lockValue: triggerLockValue,
					});
					logWorkerTrace({
						conversationId,
						event: "worker.trigger_lock.release",
						fields: `triggerMessageId=${triggerMessageId} | jobId=${workerJobId} | attempt=${attempt} | released=${released} | durationMs=${Date.now() - releaseStart}`,
					});
					if (!released) {
						console.warn(
							`[worker:ai-agent] conv=${conversationId} | Failed to release trigger run lock for message ${triggerMessageId}`
						);
					}
				}
			}

			const remaining = await getAiAgentQueueSize(redis, conversationId);
			logWorkerTrace({
				conversationId,
				event: "worker.queue.remaining",
				fields: `remaining=${remaining} | processed=${processed}`,
			});
			if (remaining > 0) {
				const wakeState = await ensureConversationWake({
					redis,
					conversationId,
					reason: "end_invariant",
					currentJobId: String(job.id ?? "__end_invariant__"),
				});
				logWorkerTrace({
					conversationId,
					event: "worker.wake.ensure.end_invariant",
					fields: `wakeState=${wakeState}`,
				});
				if (wakeState !== "scheduled") {
					const runnable = await hasRunnableWake({
						conversationId,
						currentJobId: String(job.id ?? ""),
					});
					if (!runnable) {
						await markAiAgentWakeNeeded(redis, {
							conversationId,
						});
						console.warn(
							`[worker:ai-agent] conv=${conversationId} | Queue non-empty without runnable wake, marked wake-needed`
						);
					}
				}
			} else {
				await removeAiAgentActiveConversation(redis, conversationId);
				await clearAiAgentWakeNeeded(redis, conversationId);
			}
		} finally {
			stopLockWatchdog = true;
			await lockWatchdog.catch(() => {});
			const releaseStart = Date.now();
			const released = await releaseAiAgentLock(
				redis,
				conversationId,
				lockValue
			);
			logWorkerTrace({
				conversationId,
				event: "worker.lock.release",
				fields: `released=${released} | durationMs=${Date.now() - releaseStart}`,
			});
		}
	}

	return controller;
}
