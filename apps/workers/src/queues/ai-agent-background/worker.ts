import { runBackgroundPipeline } from "@api/ai-pipeline";
import { type AiAgentBackgroundJobData, QUEUE_NAMES } from "@cossistant/jobs";
import { getSafeRedisUrl, type RedisOptions } from "@cossistant/redis";
import { db } from "@workers/db";
import { env } from "@workers/env";
import { type Job, Worker } from "bullmq";

type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
};

export function createAiAgentBackgroundWorker({
	connectionOptions,
	redisUrl,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.AI_AGENT_BACKGROUND;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);
	let worker: Worker<AiAgentBackgroundJobData> | null = null;

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

	async function processBackgroundJob(
		job: Job<AiAgentBackgroundJobData>
	): Promise<void> {
		const result = await runBackgroundPipeline({
			db,
			input: {
				...job.data,
				workflowRunId: `ai-bg-${job.data.conversationId}-${Date.now()}`,
				jobId: String(job.id ?? `job-${Date.now()}`),
			},
		});

		if (result.status === "error") {
			throw new Error(result.error ?? "Background pipeline failed");
		}
	}

	return {
		start: async () => {
			if (worker) {
				return;
			}

			console.log(
				`[worker:ai-agent-background] Using queue=${queueName} redis=${safeRedisUrl}`
			);

			worker = new Worker<AiAgentBackgroundJobData>(
				queueName,
				(job) => processBackgroundJob(job),
				{
					connection: buildConnectionOptions(),
					concurrency: env.AI_AGENT_CONCURRENCY,
				}
			);

			worker.on("failed", (job, error) => {
				console.error(
					`[worker:ai-agent-background] Job ${job?.id} failed`,
					error
				);
			});

			worker.on("error", (error) => {
				console.error("[worker:ai-agent-background] Worker error", error);
			});

			await worker.waitUntilReady();
			console.log(
				`[worker:ai-agent-background] Worker started with concurrency=${env.AI_AGENT_CONCURRENCY}`
			);
		},
		stop: async () => {
			if (!worker) {
				return;
			}
			await worker.close();
			worker = null;
			console.log("[worker:ai-agent-background] Worker stopped");
		},
	};
}
