import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { AiAgentBackgroundJobData } from "@cossistant/jobs";

type MockJob<T> = {
	id: string;
	data: T;
};

let processor:
	| ((job: MockJob<AiAgentBackgroundJobData>) => Promise<void>)
	| null = null;

const workerWaitUntilReadyMock = mock(async () => {});
const workerCloseMock = mock(async () => {});

class MockWorker<T> {
	waitUntilReady = workerWaitUntilReadyMock;
	close = workerCloseMock;

	constructor(
		_queueName: string,
		processorFn: (job: MockJob<T>) => Promise<void>
	) {
		processor = processorFn as typeof processor;
	}

	on(_event: string, _handler: (...args: unknown[]) => void) {}
}

const runBackgroundPipelineMock = mock(
	async (): Promise<
		| {
				status: "completed";
				metrics: {
					intakeMs: number;
					analysisMs: number;
					executionMs: number;
					totalMs: number;
				};
		  }
		| {
				status: "error";
				error: string;
				metrics: {
					intakeMs: number;
					analysisMs: number;
					executionMs: number;
					totalMs: number;
				};
		  }
	> => ({
		status: "completed",
		metrics: {
			intakeMs: 0,
			analysisMs: 0,
			executionMs: 0,
			totalMs: 0,
		},
	})
);

mock.module("bullmq", () => ({
	Worker: MockWorker,
	Queue: class MockQueue {},
}));

mock.module("@api/ai-pipeline", () => ({
	runBackgroundPipeline: runBackgroundPipelineMock,
}));

mock.module("@workers/db", () => ({ db: {} }));
mock.module("@workers/env", () => ({ env: { AI_AGENT_CONCURRENCY: 7 } }));
mock.module("@cossistant/redis", () => ({
	getSafeRedisUrl: () => "redis://masked",
}));

const modulePromise = import("./worker");

function buildJobData(
	overrides: Partial<AiAgentBackgroundJobData> = {}
): AiAgentBackgroundJobData {
	return {
		conversationId: "conv-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		...overrides,
	};
}

async function runJob(data: AiAgentBackgroundJobData) {
	if (!processor) {
		throw new Error("processor not initialized");
	}

	await processor({
		id: "job-1",
		data,
	});
}

describe("ai-agent background worker", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		processor = null;
		workerWaitUntilReadyMock.mockReset();
		workerCloseMock.mockReset();
		runBackgroundPipelineMock.mockReset();

		workerWaitUntilReadyMock.mockResolvedValue(undefined);
		workerCloseMock.mockResolvedValue(undefined);
		runBackgroundPipelineMock.mockResolvedValue({
			status: "completed",
			metrics: {
				intakeMs: 0,
				analysisMs: 0,
				executionMs: 0,
				totalMs: 0,
			},
		});
	});

	it("processes jobs through runBackgroundPipeline", async () => {
		const { createAiAgentBackgroundWorker } = await modulePromise;
		const worker = createAiAgentBackgroundWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await runJob(buildJobData());

		expect(runBackgroundPipelineMock).toHaveBeenCalledWith({
			db: expect.anything(),
			input: expect.objectContaining({
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				jobId: "job-1",
				workflowRunId: expect.stringContaining("ai-bg-conv-1-"),
			}),
		});

		await worker.stop();
	});

	it("throws when background pipeline returns status=error", async () => {
		runBackgroundPipelineMock.mockResolvedValueOnce({
			status: "error",
			error: "pipeline failed",
			metrics: {
				intakeMs: 0,
				analysisMs: 0,
				executionMs: 0,
				totalMs: 0,
			},
		});

		const { createAiAgentBackgroundWorker } = await modulePromise;
		const worker = createAiAgentBackgroundWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});
		await worker.start();

		await expect(runJob(buildJobData())).rejects.toThrow("pipeline failed");
		await worker.stop();
	});
});
