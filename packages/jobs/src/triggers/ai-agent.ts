/**
 * AI Agent Job Triggers
 *
 * This module provides functions to enqueue AI agent jobs.
 * The AI agent can respond to visitors, analyze conversations,
 * escalate to humans, and execute background tasks.
 *
 * IMPORTANT: Jobs are wake signals. Redis queue state remains the source of truth.
 */

import { getSafeRedisUrl, type RedisOptions } from "@cossistant/redis";
import { type JobsOptions, Queue } from "bullmq";
import {
	type AiAgentJobData,
	generateAiAgentJobId,
	QUEUE_NAMES,
} from "../types";
import { addSingleActiveJob } from "../utils/single-active-job";

/**
 * Result of enqueueing an AI agent job
 *
 * - created: New wake job was created
 * - skipped: Wake job already exists (waiting/delayed/active)
 */
export type EnqueueAiAgentResult =
	| {
			status: "created";
	  }
	| {
			status: "skipped";
			existingState: string;
	  };

/**
 * Minimum delay before AI agent processes a message (ms)
 * This prevents immediate responses that feel unnatural
 */
const MIN_AI_AGENT_DELAY_MS = 0;

/**
 * Retry configuration for AI agent jobs
 * 5 attempts with exponential backoff over ~2.5 hours
 */
const AI_RETRY_ATTEMPTS = 5;
const AI_RETRY_BASE_DELAY_MS = 5000; // 5s, 10s, 20s, 40s, 80s

export const AI_AGENT_JOB_OPTIONS: JobsOptions = {
	delay: MIN_AI_AGENT_DELAY_MS,
	attempts: AI_RETRY_ATTEMPTS,
	backoff: {
		type: "exponential",
		delay: AI_RETRY_BASE_DELAY_MS,
	},
};

type TriggerConfig = {
	connection: RedisOptions;
	redisUrl: string;
};

export function createAiAgentTriggers({ connection, redisUrl }: TriggerConfig) {
	const queueName = QUEUE_NAMES.AI_AGENT;
	let queue: Queue<AiAgentJobData> | null = null;
	let readyPromise: Promise<void> | null = null;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);

	const buildConnectionOptions = (): RedisOptions => ({
		...connection,
		tls: connection.tls ? { ...connection.tls } : undefined,
	});

	function getQueue(): Queue<AiAgentJobData> {
		if (!queue) {
			console.log(
				`[jobs:ai-agent] Using queue=${queueName} redis=${safeRedisUrl}`
			);
			queue = new Queue<AiAgentJobData>(queueName, {
				connection: buildConnectionOptions(),
				defaultJobOptions: {
					removeOnComplete: { count: 1000 }, // Keep last 1000 completed
					removeOnFail: { count: 5000 }, // Keep failed for debugging
				},
			});
		}

		return queue;
	}

	async function ensureQueueReady(): Promise<Queue<AiAgentJobData>> {
		const q = getQueue();
		if (!readyPromise) {
			readyPromise = q
				.waitUntilReady()
				.then(() => {
					console.log("[jobs:ai-agent] Queue connection ready for producers");
				})
				.catch((error) => {
					console.error(
						"[jobs:ai-agent] Failed to initialize queue connection",
						error
					);
					throw error;
				});
		}
		await readyPromise;
		return q;
	}

	/**
	 * Enqueue an AI agent job
	 *
	 * The job will be processed by the AI agent worker which runs
	 * the 5-step pipeline (intake, decision, generation, execution, followup).
	 *
	 * Wake job behavior:
	 * - waiting/delayed/completed/failed jobs are replaced with latest payload
	 * - active jobs are kept to avoid concurrent same-conversation execution
	 */
	async function enqueueAiAgentJob(
		data: AiAgentJobData
	): Promise<EnqueueAiAgentResult> {
		const q = await ensureQueueReady();
		const jobId = generateAiAgentJobId(
			data.conversationId,
			data.triggerMessageId
		);
		const result = await addSingleActiveJob({
			queue: q,
			jobId,
			jobName: "ai-agent",
			data,
			options: AI_AGENT_JOB_OPTIONS,
			logPrefix: "[jobs:ai-agent]",
		});

		if (result.status === "skipped") {
			return { status: "skipped", existingState: result.existingState };
		}

		const job = result.job;

		const [state, counts] = await Promise.all([
			job.getState().catch(() => "unknown"),
			q.getJobCounts("delayed", "waiting", "active").catch(() => null),
		]);

		const countSummary = counts
			? `| counts delayed:${counts.delayed} waiting:${counts.waiting} active:${counts.active}`
			: "";

		console.log(
			`[jobs:ai-agent] Job ${job.id} created for conversation ${data.conversationId} (state:${state}) ${countSummary}`
		);

		return { status: "created" };
	}

	return {
		enqueueAiAgentJob,
		close: async (): Promise<void> => {
			if (queue) {
				await queue.close();
				queue = null;
				readyPromise = null;
			}
		},
	};
}
