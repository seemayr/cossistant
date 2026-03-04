import { getConversationById } from "@api/db/queries/conversation";
import {
	AI_AGENT_BACKGROUND_DELAY_MS,
	AI_AGENT_INITIAL_DELAY_MS,
	AI_AGENT_MAX_RUN_ATTEMPTS,
	AI_AGENT_RETRY_DELAY_MS,
	type AiAgentBackgroundJobData,
	type AiAgentJobData,
	clearAiAgentRunCursor,
	clearAiAgentRunCursorIfMatches,
	enqueueConversationScopedAiBackgroundJob,
	enqueueConversationScopedAiJob,
	getAiAgentRunCursor,
	QUEUE_NAMES,
	setAiAgentRunCursor,
} from "@cossistant/jobs";
import {
	getSafeRedisUrl,
	type Redis,
	type RedisOptions,
} from "@cossistant/redis";
import { db } from "@workers/db";
import { env } from "@workers/env";
import { type Job, Queue, Worker } from "bullmq";
import {
	buildMessageWindowFromCursor,
	findNextTriggerableMessageAfterCursor,
} from "./message-window";
import { PipelineWindowError, runPipelineForWindow } from "./pipeline-runner";

type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
	stateRedis: Redis;
};

type AiAgentProcessResult = {
	hadCursor: boolean;
	processedMessageCount: number;
};

export function createAiAgentWorker({
	connectionOptions,
	redisUrl,
	stateRedis,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.AI_AGENT;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);
	let worker: Worker<AiAgentJobData> | null = null;
	let schedulerQueue: Queue<AiAgentJobData> | null = null;
	let backgroundSchedulerQueue: Queue<AiAgentBackgroundJobData> | null = null;

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

	async function processAiAgentJob(
		job: Job<AiAgentJobData>
	): Promise<AiAgentProcessResult> {
		const { conversationId, aiAgentId } = job.data;
		const cursor = await getAiAgentRunCursor(stateRedis, conversationId);
		if (!cursor) {
			return { hadCursor: false, processedMessageCount: 0 };
		}

		const conversation = await getConversationById(db, { conversationId });
		if (!conversation) {
			await clearAiAgentRunCursor(stateRedis, conversationId);
			return { hadCursor: false, processedMessageCount: 0 };
		}

		const windowMessages = await buildMessageWindowFromCursor({
			db,
			organizationId: conversation.organizationId,
			conversationId,
			cursor,
		});

		if (windowMessages.length === 0) {
			return { hadCursor: true, processedMessageCount: 0 };
		}

		let processedMessageCount = 0;

		try {
			const runResult = await runPipelineForWindow({
				db,
				conversation: {
					id: conversation.id,
					websiteId: conversation.websiteId,
					organizationId: conversation.organizationId,
					visitorId: conversation.visitorId,
				},
				aiAgentId,
				jobId: String(job.id ?? `job-${Date.now()}`),
				messages: windowMessages,
			});
			processedMessageCount = runResult.processedMessageCount;
		} catch (error) {
			if (error instanceof PipelineWindowError) {
				await setAiAgentRunCursor(stateRedis, {
					conversationId,
					messageId: error.failedMessage.id,
					messageCreatedAt: error.failedMessage.createdAt,
				});
			}
			throw error;
		}

		return { hadCursor: true, processedMessageCount };
	}

	async function scheduleBackgroundPipeline(
		job: Job<AiAgentJobData>,
		result: AiAgentProcessResult
	): Promise<void> {
		if (result.processedMessageCount <= 0) {
			return;
		}

		if (!backgroundSchedulerQueue) {
			return;
		}

		await enqueueConversationScopedAiBackgroundJob({
			queue: backgroundSchedulerQueue,
			data: {
				conversationId: job.data.conversationId,
				websiteId: job.data.websiteId,
				organizationId: job.data.organizationId,
				aiAgentId: job.data.aiAgentId,
			},
			delayMs: AI_AGENT_BACKGROUND_DELAY_MS,
		});
	}

	async function handleCompleted(
		job: Job<AiAgentJobData>,
		result: AiAgentProcessResult
	): Promise<void> {
		try {
			if (!result.hadCursor) {
				return;
			}
			if (!schedulerQueue) {
				return;
			}

			const currentCursor = await getAiAgentRunCursor(
				stateRedis,
				job.data.conversationId
			);
			if (!currentCursor) {
				return;
			}

			const conversation = await getConversationById(db, {
				conversationId: job.data.conversationId,
			});

			if (!conversation) {
				await clearAiAgentRunCursor(stateRedis, job.data.conversationId);
				return;
			}

			const afterCreatedAt = conversation.aiAgentLastProcessedMessageCreatedAt;
			const afterId = conversation.aiAgentLastProcessedMessageId;

			if (!(afterCreatedAt && afterId)) {
				await clearAiAgentRunCursorIfMatches(stateRedis, {
					conversationId: job.data.conversationId,
					messageId: currentCursor.messageId,
					messageCreatedAt: currentCursor.messageCreatedAt,
				});
				return;
			}

			const nextMessage = await findNextTriggerableMessageAfterCursor({
				db,
				organizationId: conversation.organizationId,
				conversationId: conversation.id,
				afterCreatedAt,
				afterId,
			});

			if (!nextMessage) {
				// Compare-and-clear avoids deleting a newer cursor that may have been written
				// by a concurrent trigger while this completion hook was running.
				await clearAiAgentRunCursorIfMatches(stateRedis, {
					conversationId: job.data.conversationId,
					messageId: currentCursor.messageId,
					messageCreatedAt: currentCursor.messageCreatedAt,
				});
				return;
			}

			await setAiAgentRunCursor(stateRedis, {
				conversationId: conversation.id,
				messageId: nextMessage.id,
				messageCreatedAt: nextMessage.createdAt,
			});

			await enqueueConversationScopedAiJob({
				queue: schedulerQueue,
				data: {
					...job.data,
					runAttempt: 0,
				},
				delayMs: 0,
			});
		} finally {
			await scheduleBackgroundPipeline(job, result);
		}
	}

	async function handleFailed(job: Job<AiAgentJobData>): Promise<void> {
		if (!schedulerQueue) {
			return;
		}

		const cursor = await getAiAgentRunCursor(
			stateRedis,
			job.data.conversationId
		);
		if (!cursor) {
			return;
		}

		const runAttempt = job.data.runAttempt ?? 0;
		if (runAttempt >= AI_AGENT_MAX_RUN_ATTEMPTS - 1) {
			await clearAiAgentRunCursor(stateRedis, job.data.conversationId);
			return;
		}

		await enqueueConversationScopedAiJob({
			queue: schedulerQueue,
			data: {
				...job.data,
				runAttempt: runAttempt + 1,
			},
			delayMs: AI_AGENT_RETRY_DELAY_MS,
		});
	}

	return {
		start: async () => {
			if (worker) {
				return;
			}

			console.log(
				`[worker:ai-agent] Using queue=${queueName} redis=${safeRedisUrl}`
			);

			schedulerQueue = new Queue<AiAgentJobData>(queueName, {
				connection: buildConnectionOptions(),
			});

			await schedulerQueue.waitUntilReady();

			backgroundSchedulerQueue = new Queue<AiAgentBackgroundJobData>(
				QUEUE_NAMES.AI_AGENT_BACKGROUND,
				{
					connection: buildConnectionOptions(),
				}
			);

			await backgroundSchedulerQueue.waitUntilReady();

			worker = new Worker<AiAgentJobData>(
				queueName,
				(job) => processAiAgentJob(job),
				{
					connection: buildConnectionOptions(),
					concurrency: env.AI_AGENT_CONCURRENCY,
				}
			);

			worker.on("completed", (job, result) => {
				if (!(job && result)) {
					return;
				}
				void handleCompleted(job, result as AiAgentProcessResult).catch(
					(error) => {
						console.error("[worker:ai-agent] completed hook failed", error);
					}
				);
			});

			worker.on("failed", (job, error) => {
				if (!job) {
					return;
				}
				void handleFailed(job).catch((retryError) => {
					console.error(
						"[worker:ai-agent] failed hook retry failed",
						retryError
					);
				});
				console.error("[worker:ai-agent] Job failed", error);
			});

			worker.on("error", (error) => {
				console.error("[worker:ai-agent] Worker error", error);
			});

			await worker.waitUntilReady();
			console.log(
				`[worker:ai-agent] Worker started with concurrency=${env.AI_AGENT_CONCURRENCY} delay=${AI_AGENT_INITIAL_DELAY_MS}ms`
			);
		},
		stop: async () => {
			await Promise.all([
				(async () => {
					if (!worker) {
						return;
					}
					await worker.close();
					worker = null;
					console.log("[worker:ai-agent] Worker stopped");
				})(),
				(async () => {
					if (!schedulerQueue) {
						return;
					}
					await schedulerQueue.close();
					schedulerQueue = null;
				})(),
				(async () => {
					if (!backgroundSchedulerQueue) {
						return;
					}
					await backgroundSchedulerQueue.close();
					backgroundSchedulerQueue = null;
				})(),
			]);
		},
	};
}
