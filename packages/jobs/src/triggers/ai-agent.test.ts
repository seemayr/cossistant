import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AiAgentJobData } from "../types";

type MockJobState = "active" | "waiting" | "delayed" | "completed" | "failed";

const waitUntilReadyMock = mock(async () => {});
const getJobCountsMock = mock(async () => ({
	delayed: 0,
	waiting: 0,
	active: 0,
}));
const closeMock = mock(async () => {});
const addMock = mock(
	async (name: string, data: AiAgentJobData, opts: { jobId: string }) => {
		lastAddedJobId = opts.jobId;
		lastAddedData = data;
		existingJobState = "waiting";
		existingJobData = data;
		return {
			id: "wake-job-1",
			data,
			getState: async () => "waiting",
		};
	}
);

let existingJobState: MockJobState | null = null;
let existingJobData: AiAgentJobData | null = null;
let lastAddedJobId: string | null = null;
let lastAddedData: AiAgentJobData | null = null;

class MockQueue<T extends AiAgentJobData> {
	waitUntilReady = waitUntilReadyMock;
	getJobCounts = getJobCountsMock;
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
		...overrides,
	};
}

describe("createAiAgentTriggers", () => {
	beforeEach(() => {
		waitUntilReadyMock.mockReset();
		getJobCountsMock.mockReset();
		closeMock.mockReset();
		addMock.mockReset();

		waitUntilReadyMock.mockResolvedValue(undefined);
		getJobCountsMock.mockResolvedValue({ delayed: 0, waiting: 0, active: 0 });
		closeMock.mockResolvedValue(undefined);
		addMock.mockImplementation(
			async (name: string, data: AiAgentJobData, opts: { jobId: string }) => {
				lastAddedJobId = opts.jobId;
				lastAddedData = data;
				existingJobState = "waiting";
				existingJobData = data;
				return {
					id: "wake-job-1",
					data,
					getState: async () => "waiting",
				};
			}
		);

		existingJobState = null;
		existingJobData = null;
		lastAddedJobId = null;
		lastAddedData = null;
	});

	it("builds conversation-scoped wake job IDs", async () => {
		const { createAiAgentTriggers } = await triggerModulePromise;
		const triggers = createAiAgentTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentJob(
			buildJobData({ triggerMessageId: "msg-42" })
		);

		expect(result.status).toBe("created");
		expect(addMock).toHaveBeenCalledTimes(1);
		expect(lastAddedJobId).toBe("ai-agent-conv-1");
		expect(lastAddedData?.triggerMessageId).toBe("msg-42");

		await triggers.close();
	});

	it("returns skipped when an active wake already exists for the conversation", async () => {
		existingJobState = "active";
		existingJobData = buildJobData({ triggerMessageId: "msg-42" });
		const { createAiAgentTriggers } = await triggerModulePromise;
		const triggers = createAiAgentTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentJob(
			buildJobData({ triggerMessageId: "msg-42" })
		);

		expect(result).toEqual({
			status: "skipped",
			existingState: "active",
		});
		expect(addMock).not.toHaveBeenCalled();

		await triggers.close();
	});
});
