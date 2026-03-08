import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AiAgentJobData } from "../types";

type MockJobState = "active" | "waiting" | "delayed" | "completed" | "failed";

const waitUntilReadyMock = mock(async () => {});
const closeMock = mock(async () => {});
const addMock = mock(
	async (name: string, data: AiAgentJobData, opts: Record<string, unknown>) => {
		lastAddedJobId = String(opts.jobId ?? "");
		lastAddedData = data;
		lastAddedOptions = opts;
		existingJobState = "waiting";
		existingJobData = data;
		return {
			id: "job-1",
			data,
			getState: async () => "waiting",
		};
	}
);

let existingJobState: MockJobState | null = null;
let existingJobData: AiAgentJobData | null = null;
let lastAddedJobId: string | null = null;
let lastAddedData: AiAgentJobData | null = null;
let lastAddedOptions: Record<string, unknown> | null = null;
let removedExistingJobCount = 0;

class MockQueue<T extends AiAgentJobData> {
	waitUntilReady = waitUntilReadyMock;
	close = closeMock;
	add = addMock;

	async getJob(jobId: string) {
		if (!existingJobState) {
			return null;
		}

		return {
			id: jobId,
			data: existingJobData as T,
			getState: async () => existingJobState,
			remove: async () => {
				removedExistingJobCount += 1;
				existingJobState = null;
				existingJobData = null;
			},
		};
	}
}

mock.module("bullmq", () => ({
	Queue: MockQueue,
}));

const triggerModulePromise = import("./ai-agent");

function buildJobData(overrides: Partial<AiAgentJobData> = {}): AiAgentJobData {
	return {
		conversationId: "conv-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		messageId: "msg-1",
		messageCreatedAt: "2026-03-04T10:00:00.000Z",
		...overrides,
	};
}

describe("createAiAgentTriggers", () => {
	beforeEach(() => {
		waitUntilReadyMock.mockReset();
		closeMock.mockReset();
		addMock.mockReset();

		waitUntilReadyMock.mockResolvedValue(undefined);
		closeMock.mockResolvedValue(undefined);
		addMock.mockImplementation(
			async (
				_name: string,
				data: AiAgentJobData,
				opts: Record<string, unknown>
			) => {
				lastAddedJobId = String(opts.jobId ?? "");
				lastAddedData = data;
				lastAddedOptions = opts;
				existingJobState = "waiting";
				existingJobData = data;
				return {
					id: "job-1",
					data,
					getState: async () => "waiting",
				};
			}
		);

		existingJobState = null;
		existingJobData = null;
		lastAddedJobId = null;
		lastAddedData = null;
		lastAddedOptions = null;
		removedExistingJobCount = 0;
	});

	it("enqueues with conversation-scoped id and default queue options", async () => {
		const { createAiAgentTriggers } = await triggerModulePromise;
		const triggers = createAiAgentTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentJob(buildJobData());

		expect(result).toEqual({ status: "created" });
		expect(lastAddedJobId).toBe("ai-agent-conv-1");
		expect(lastAddedData?.conversationId).toBe("conv-1");
		expect(lastAddedOptions?.delay).toBe(300);
		expect(lastAddedOptions?.removeOnComplete).toBe(true);
		expect(lastAddedOptions?.removeOnFail).toBe(true);

		await triggers.close();
	});

	it("skips enqueue when active/waiting/delayed job exists", async () => {
		existingJobState = "active";
		existingJobData = buildJobData();
		const { createAiAgentTriggers } = await triggerModulePromise;
		const triggers = createAiAgentTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentJob(buildJobData());

		expect(result).toEqual({ status: "skipped", existingState: "active" });
		expect(addMock).not.toHaveBeenCalled();
		expect(removedExistingJobCount).toBe(0);

		await triggers.close();
	});

	it("replaces failed/completed jobs before enqueue", async () => {
		existingJobState = "failed";
		existingJobData = buildJobData();
		const { createAiAgentTriggers } = await triggerModulePromise;
		const triggers = createAiAgentTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentJob(buildJobData());

		expect(result).toEqual({ status: "created" });
		expect(removedExistingJobCount).toBe(1);
		expect(addMock).toHaveBeenCalledTimes(1);

		await triggers.close();
	});

	it("supports delay override for follow-up scheduling", async () => {
		const { createAiAgentTriggers } = await triggerModulePromise;
		const triggers = createAiAgentTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await triggers.enqueueAiAgentJob(buildJobData(), { delayMs: 0 });

		expect(lastAddedOptions?.delay).toBe(0);

		await triggers.close();
	});
});
