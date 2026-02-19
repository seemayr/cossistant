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
import { emitWorkflowStarted } from "@api/ai-agent/events";
import {
	isAiPausedForConversation,
	isAiPausedInRedis,
} from "@api/ai-agent/kill-switch";
import {
	markConversationAsSeen,
	updateConversationAiCursor,
} from "@api/db/mutations/conversation";
import {
	getConversationById,
	getConversationMessagesAfterCursor,
	getMessageMetadata,
	getMessageMetadataBatch,
} from "@api/db/queries/conversation";
import { emitConversationSeenEvent } from "@api/utils/conversation-realtime";
import {
	AI_AGENT_JOB_OPTIONS,
	type AiAgentJobData,
	acquireAiAgentLock,
	enqueueAiAgentMessage,
	generateAiAgentJobId,
	getAiAgentFailureKey,
	getAiAgentQueueKey,
	getAiAgentQueueSize,
	peekAiAgentQueue,
	peekAiAgentQueueBatch,
	QUEUE_NAMES,
	releaseAiAgentLock,
	removeAiAgentQueueMessage,
	removeAiAgentQueueMessages,
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
import {
	isTriggerableMessage,
	isVisitorTrigger,
	resolveCoalescedVisitorBatch,
} from "./coalescing";
import { resolvePipelineFailureAction } from "./failure-policy";

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

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

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
		},
		stop: async () => {
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
	const VISITOR_DEBOUNCE_MS = env.AI_AGENT_VISITOR_DEBOUNCE_MS;
	const COALESCE_BATCH_LIMIT = 10;
	const FAILURE_THRESHOLD = 3;
	const FAILURE_TTL_SECONDS = 60 * 60;
	const WAIT_DELAY_MS = 10_000;
	const WAIT_DEFER_TTL_SECONDS = Math.ceil(WAIT_DELAY_MS / 1000);
	const WAIT_CYCLE_TTL_SECONDS = 10 * 60;

	function getWaitCycleKey(
		conversationId: string,
		triggerMessageId: string
	): string {
		return `ai-agent:wait:${conversationId}:${triggerMessageId}`;
	}

	function getWaitDeferKey(conversationId: string): string {
		return `ai-agent:wait-defer:${conversationId}`;
	}

	async function acquireWaitCycle(params: {
		redis: Redis;
		conversationId: string;
		triggerMessageId: string;
	}): Promise<boolean> {
		const key = getWaitCycleKey(params.conversationId, params.triggerMessageId);
		const result = await params.redis.set(
			key,
			"1",
			"EX",
			WAIT_CYCLE_TTL_SECONDS,
			"NX"
		);
		return result === "OK";
	}

	async function selectLatestTriggerableQueuedMessage(params: {
		redis: Redis;
		conversationId: string;
		organizationId: string;
	}): Promise<Awaited<ReturnType<typeof getMessageMetadata>> | null> {
		const queueKey = getAiAgentQueueKey(params.conversationId);
		const messageIds = await params.redis.zrange(queueKey, 0, -1);
		if (messageIds.length === 0) {
			return null;
		}

		const metadataRows = await getMessageMetadataBatch(db, {
			organizationId: params.organizationId,
			messageIds,
		});
		const metadataById = new Map(metadataRows.map((row) => [row.id, row]));

		for (let index = messageIds.length - 1; index >= 0; index--) {
			const messageId = messageIds[index];
			if (!messageId) {
				continue;
			}
			const metadata = metadataById.get(messageId);
			if (!metadata) {
				continue;
			}
			if (!isTriggerableMessage(metadata)) {
				continue;
			}
			return metadata;
		}

		return null;
	}

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
					setWake: false,
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
		waitResumeForTriggerMessageId?: string;
	}): Promise<void> {
		if (!wakeQueue) {
			console.warn(
				`[worker:ai-agent] conv=${params.jobData.conversationId} | Wake queue not ready, cannot schedule continuation drain`
			);
			return;
		}

		const wakeData: AiAgentJobData = {
			conversationId: params.jobData.conversationId,
			websiteId: params.jobData.websiteId,
			organizationId: params.jobData.organizationId,
			aiAgentId: params.jobData.aiAgentId,
			triggerMessageId: params.triggerMessageId,
			waitResumeForTriggerMessageId: params.waitResumeForTriggerMessageId,
		};
		const baseJobId = generateAiAgentJobId(
			params.jobData.conversationId,
			params.triggerMessageId
		);
		let jobId = baseJobId;

		const existingJob = await wakeQueue.getJob(baseJobId);
		if (existingJob) {
			const existingState = await existingJob.getState();
			if (existingState === "completed" || existingState === "failed") {
				await existingJob.remove();
			} else if (existingState === "delayed" || existingState === "waiting") {
				console.log(
					`[worker:ai-agent] conv=${params.jobData.conversationId} | Continuation wake already queued for trigger ${params.triggerMessageId} (${existingState})`
				);
				return;
			} else if (existingState === "active") {
				if (String(existingJob.id) !== params.currentJobId) {
					console.log(
						`[worker:ai-agent] conv=${params.jobData.conversationId} | Continuation wake already active for trigger ${params.triggerMessageId}`
					);
					return;
				}
				jobId = `${baseJobId}-continue-${Date.now()}`;
			} else {
				jobId = `${baseJobId}-continue-${Date.now()}`;
			}
		}

		try {
			const delayMs = params.delayMs ?? AI_AGENT_JOB_OPTIONS.delay ?? 0;
			await wakeQueue.add("ai-agent", wakeData, {
				...AI_AGENT_JOB_OPTIONS,
				delay: delayMs,
				jobId,
			});
			console.log(
				`[worker:ai-agent] conv=${params.jobData.conversationId} | Scheduled continuation drain for trigger ${params.triggerMessageId} | delayMs=${delayMs} | waitResume=${params.waitResumeForTriggerMessageId ?? "none"}`
			);
		} catch (error) {
			console.error(
				`[worker:ai-agent] conv=${params.jobData.conversationId} | Failed to schedule continuation drain`,
				error
			);
		}
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

	/**
	 * Process an AI agent job through the pipeline
	 */
	async function processAiAgentJob(
		redis: Redis,
		job: Job<AiAgentJobData>
	): Promise<void> {
		const { conversationId, aiAgentId } = job.data;
		const lockValue = String(job.id ?? `job-${Date.now()}`);
		const lockAcquired = await acquireAiAgentLock(
			redis,
			conversationId,
			lockValue,
			DRAIN_LOCK_TTL_MS
		);

		if (!lockAcquired) {
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
					const renewed = await renewAiAgentLock(
						redis,
						conversationId,
						lockValue,
						DRAIN_LOCK_TTL_MS
					);
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
			const conversation = await getConversationById(db, { conversationId });

			if (!conversation) {
				console.error(`[worker:ai-agent] conv=${conversationId} | Not found`);
				return;
			}

			const pausedAtStart = await isAiPausedForConversation({
				db,
				redis,
				conversationId,
				fallbackPausedUntil: conversation.aiPausedUntil,
				skipDbLookup: true,
			});
			if (pausedAtStart) {
				console.log(
					`[worker:ai-agent] conv=${conversationId} | AI paused, skipping drain`
				);
				return;
			}

			const waitDeferKey = getWaitDeferKey(conversationId);
			if (job.data.waitResumeForTriggerMessageId) {
				await redis.del(waitDeferKey);
			} else {
				const waitDeferred = await redis.get(waitDeferKey);
				if (waitDeferred) {
					console.log(
						`[worker:ai-agent] conv=${conversationId} | Active wait defer window, skipping non-resume drain`
					);
					return;
				}
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

			await hydrateQueueFromCursor(redis, conversation);
			let cursor: AiCursor = {
				createdAt: conversation.aiAgentLastProcessedMessageCreatedAt ?? null,
				messageId: conversation.aiAgentLastProcessedMessageId ?? null,
			};

			const drainStart = Date.now();
			let processed = 0;
			let shouldRequeue = true;
			let continuationTriggerMessageId: string | null = null;
			let waitResumeForTriggerMessageId =
				job.data.waitResumeForTriggerMessageId ?? null;

			while (true) {
				if (lockLost) {
					console.error(
						`[worker:ai-agent] conv=${conversationId} | Lock lease lost, stopping drain loop before next trigger`
					);
					shouldRequeue = false;
					break;
				}
				if (processed >= DRAIN_MAX_MESSAGES) {
					break;
				}
				if (Date.now() - drainStart >= DRAIN_MAX_RUNTIME_MS) {
					break;
				}
				if (await isAiPausedInRedis(redis, conversationId)) {
					console.log(
						`[worker:ai-agent] conv=${conversationId} | AI paused during drain, exiting`
					);
					shouldRequeue = false;
					break;
				}

				let nextMessageId: string | null = null;
				let messageMetadata: Awaited<
					ReturnType<typeof getMessageMetadata>
				> | null = null;
				let skipVisitorCoalescing = false;

				if (waitResumeForTriggerMessageId) {
					const latestQueuedMessage =
						await selectLatestTriggerableQueuedMessage({
							redis,
							conversationId,
							organizationId: conversation.organizationId,
						});
					waitResumeForTriggerMessageId = null;
					if (latestQueuedMessage) {
						nextMessageId = latestQueuedMessage.id;
						messageMetadata = latestQueuedMessage;
						skipVisitorCoalescing = true;
						console.log(
							`[worker:ai-agent] conv=${conversationId} | Wait resume selected latest trigger ${nextMessageId}`
						);
					}
				}

				if (!nextMessageId) {
					nextMessageId = await peekAiAgentQueue(redis, conversationId);
				}

				if (!nextMessageId) {
					break;
				}

				if (!messageMetadata) {
					messageMetadata = await getMessageMetadata(db, {
						messageId: nextMessageId,
						organizationId: conversation.organizationId,
					});
				}

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

				let effectiveMessageMetadata = messageMetadata;
				let coalescedMessageIds = [messageMetadata.id];

				if (!skipVisitorCoalescing && isVisitorTrigger(messageMetadata)) {
					if (VISITOR_DEBOUNCE_MS > 0) {
						await sleep(VISITOR_DEBOUNCE_MS);
						if (lockLost) {
							shouldRequeue = false;
							break;
						}
					}

					const queueBatchIds = await peekAiAgentQueueBatch(
						redis,
						conversationId,
						COALESCE_BATCH_LIMIT
					);
					if (queueBatchIds.length > 1) {
						const metadataRows = await getMessageMetadataBatch(db, {
							organizationId: conversation.organizationId,
							messageIds: queueBatchIds,
						});
						const metadataById = new Map(
							metadataRows.map((row) => [row.id, row])
						);

						const coalesced = resolveCoalescedVisitorBatch({
							headMessage: messageMetadata,
							orderedMessageIds: queueBatchIds,
							metadataById,
						});
						effectiveMessageMetadata = coalesced.effectiveMessage;
						coalescedMessageIds = coalesced.coalescedMessageIds;

						if (coalescedMessageIds.length > 1) {
							console.log(
								`[worker:ai-agent] conv=${conversationId} | coalescedCount=${coalescedMessageIds.length} | effectiveTriggerMessageId=${effectiveMessageMetadata.id}`
							);
						}
					}
				}

				const workflowRunId = `ai-msg-${effectiveMessageMetadata.id}`;

				// Emit workflow started event (dashboard only)
				await emitWorkflowStarted({
					conversation,
					aiAgentId,
					workflowRunId,
					triggerMessageId: effectiveMessageMetadata.id,
				});

				let result: Awaited<ReturnType<typeof runAiAgentPipeline>>;
				try {
					result = await runAiAgentPipeline({
						db,
						input: {
							conversationId,
							messageId: effectiveMessageMetadata.id,
							messageCreatedAt: effectiveMessageMetadata.createdAt,
							websiteId: conversation.websiteId,
							organizationId: conversation.organizationId,
							visitorId: conversation.visitorId,
							aiAgentId,
							workflowRunId,
							jobId: String(job.id ?? `job-${Date.now()}`),
						},
					});
				} catch (error) {
					console.error(
						`[worker:ai-agent] conv=${conversationId} | Pipeline threw unexpectedly for message ${effectiveMessageMetadata.id}`,
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
				}

				if (lockLost) {
					console.error(
						`[worker:ai-agent] conv=${conversationId} | Lock lease lost after pipeline run, skipping queue mutation`
					);
					shouldRequeue = false;
					break;
				}

				if (result.status === "error") {
					const failureCount = await recordMessageFailure(
						redis,
						conversationId,
						effectiveMessageMetadata.id
					);
					const failureAction = resolvePipelineFailureAction({
						retryable: result.retryable,
						failureCount,
						failureThreshold: FAILURE_THRESHOLD,
					});

					if (failureAction === "drop") {
						console.error(
							`[worker:ai-agent] conv=${conversationId} | Message ${effectiveMessageMetadata.id} failed ${failureCount} times (retryable=${result.retryable}, publicMessagesSent=${result.publicMessagesSent}), dropping`
						);
						await removeAiAgentQueueMessages(
							redis,
							conversationId,
							coalescedMessageIds
						);
						await updateConversationAiCursor(db, {
							conversationId,
							organizationId: conversation.organizationId,
							messageId: effectiveMessageMetadata.id,
							messageCreatedAt: effectiveMessageMetadata.createdAt,
						});
						cursor = advanceCursor(cursor, effectiveMessageMetadata);
						processed += coalescedMessageIds.length;
						continue;
					}

					console.warn(
						`[worker:ai-agent] conv=${conversationId} | Message ${effectiveMessageMetadata.id} failed (${failureCount}/${FAILURE_THRESHOLD}), keeping queued for retry`
					);
					// Keep the message at the queue head and requeue drain.
					continuationTriggerMessageId = effectiveMessageMetadata.id;
					break;
				}

				if (result.action === "wait") {
					const waitCycleAcquired = await acquireWaitCycle({
						redis,
						conversationId,
						triggerMessageId: effectiveMessageMetadata.id,
					});

					if (waitCycleAcquired) {
						await redis.set(
							getWaitDeferKey(conversationId),
							"1",
							"EX",
							WAIT_DEFER_TTL_SECONDS
						);
						await requeueDrainJob({
							jobData: job.data,
							triggerMessageId: effectiveMessageMetadata.id,
							currentJobId: String(job.id ?? ""),
							delayMs: WAIT_DELAY_MS,
							waitResumeForTriggerMessageId: effectiveMessageMetadata.id,
						});
						console.log(
							`[worker:ai-agent] conv=${conversationId} | Wait action accepted for trigger ${effectiveMessageMetadata.id}; deferred ${WAIT_DELAY_MS}ms`
						);
						shouldRequeue = false;
						break;
					}

					console.warn(
						`[worker:ai-agent] conv=${conversationId} | Wait action rejected for trigger ${effectiveMessageMetadata.id} (already used), processing as no-op completion`
					);
				}

				await updateConversationAiCursor(db, {
					conversationId,
					organizationId: conversation.organizationId,
					messageId: effectiveMessageMetadata.id,
					messageCreatedAt: effectiveMessageMetadata.createdAt,
				});
				cursor = advanceCursor(cursor, effectiveMessageMetadata);
				await removeAiAgentQueueMessages(
					redis,
					conversationId,
					coalescedMessageIds
				);
				processed += coalescedMessageIds.length;
			}

			const remaining = await getAiAgentQueueSize(redis, conversationId);
			if (shouldRequeue && remaining > 0) {
				const nextTriggerMessageId =
					continuationTriggerMessageId ??
					(await peekAiAgentQueue(redis, conversationId));
				if (nextTriggerMessageId) {
					await requeueDrainJob({
						jobData: job.data,
						triggerMessageId: nextTriggerMessageId,
						currentJobId: String(job.id ?? ""),
					});
				}
			}
		} finally {
			stopLockWatchdog = true;
			await lockWatchdog.catch(() => {});
			await releaseAiAgentLock(redis, conversationId, lockValue);
		}
	}

	return controller;
}
