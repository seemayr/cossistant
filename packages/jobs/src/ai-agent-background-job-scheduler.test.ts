import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Queue } from "bullmq";
import {
	AI_AGENT_BACKGROUND_DELAY_MS,
	enqueueConversationScopedAiBackgroundJob,
} from "./ai-agent-background-job-scheduler";
import type { AiAgentBackgroundJobData } from "./types";

type MockJobState =
	| "active"
	| "waiting"
	| "delayed"
	| "completed"
	| "failed"
	| "paused";

function buildJobData(
	overrides: Partial<AiAgentBackgroundJobData> = {}
): AiAgentBackgroundJobData {
	return {
		conversationId: "conv-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		sourceMessageId: "msg-1",
		sourceMessageCreatedAt: "2026-03-04T10:00:00.000Z",
		...overrides,
	};
}

describe("enqueueConversationScopedAiBackgroundJob", () => {
	let existingState: MockJobState | null;
	let removeCount: number;
	const addMock = mock(
		async (
			_name: string,
			_data: AiAgentBackgroundJobData,
			_options: unknown
		) => ({ id: "job-1" })
	);
	const getJobMock = mock(async (_jobId: string) => null);

	function buildQueue(): Queue<AiAgentBackgroundJobData> {
		return {
			add: addMock,
			getJob: getJobMock,
		} as unknown as Queue<AiAgentBackgroundJobData>;
	}

	beforeEach(() => {
		existingState = null;
		removeCount = 0;
		addMock.mockReset();
		getJobMock.mockReset();

		addMock.mockResolvedValue({ id: "job-1" });
		getJobMock.mockImplementation(async (_jobId: string) => {
			if (!existingState) {
				return null;
			}

			return {
				id: "ai-agent-background-conv-1",
				getState: async () => existingState,
				remove: async () => {
					removeCount += 1;
					existingState = null;
				},
			};
		});
	});

	it("creates a delayed background job when no existing conversation job", async () => {
		const result = await enqueueConversationScopedAiBackgroundJob({
			queue: buildQueue(),
			data: buildJobData(),
		});

		expect(result).toEqual({ status: "created" });
		expect(addMock).toHaveBeenCalledWith(
			"ai-agent-background",
			buildJobData(),
			{
				attempts: 1,
				delay: AI_AGENT_BACKGROUND_DELAY_MS,
				jobId: "ai-agent-background-conv-1",
				removeOnComplete: true,
				removeOnFail: true,
			}
		);
	});

	it("reschedules waiting/delayed jobs by removing and recreating with a fresh delay", async () => {
		existingState = "waiting";
		const waitingResult = await enqueueConversationScopedAiBackgroundJob({
			queue: buildQueue(),
			data: buildJobData(),
		});

		existingState = "delayed";
		const delayedResult = await enqueueConversationScopedAiBackgroundJob({
			queue: buildQueue(),
			data: buildJobData(),
		});

		expect(waitingResult).toEqual({
			status: "rescheduled",
			previousState: "waiting",
		});
		expect(delayedResult).toEqual({
			status: "rescheduled",
			previousState: "delayed",
		});
		expect(removeCount).toBe(2);
		expect(addMock).toHaveBeenCalledTimes(2);
	});

	it("skips enqueue when active job exists", async () => {
		existingState = "active";

		const result = await enqueueConversationScopedAiBackgroundJob({
			queue: buildQueue(),
			data: buildJobData(),
		});

		expect(result).toEqual({ status: "skipped_active" });
		expect(addMock).not.toHaveBeenCalled();
		expect(removeCount).toBe(0);
	});

	it("replaces completed/failed jobs before creating a new one", async () => {
		existingState = "completed";
		const completedResult = await enqueueConversationScopedAiBackgroundJob({
			queue: buildQueue(),
			data: buildJobData(),
		});

		existingState = "failed";
		const failedResult = await enqueueConversationScopedAiBackgroundJob({
			queue: buildQueue(),
			data: buildJobData(),
		});

		expect(completedResult).toEqual({ status: "created" });
		expect(failedResult).toEqual({ status: "created" });
		expect(removeCount).toBe(2);
		expect(addMock).toHaveBeenCalledTimes(2);
	});

	it("returns skipped_unexpected for unsupported states", async () => {
		existingState = "paused";

		const result = await enqueueConversationScopedAiBackgroundJob({
			queue: buildQueue(),
			data: buildJobData(),
		});

		expect(result).toEqual({
			status: "skipped_unexpected",
			existingState: "paused",
		});
		expect(addMock).not.toHaveBeenCalled();
		expect(removeCount).toBe(0);
	});

	it("honors explicit delay override", async () => {
		await enqueueConversationScopedAiBackgroundJob({
			queue: buildQueue(),
			data: buildJobData(),
			delayMs: 0,
		});

		expect(addMock).toHaveBeenCalledWith(
			"ai-agent-background",
			buildJobData(),
			{
				attempts: 1,
				delay: 0,
				jobId: "ai-agent-background-conv-1",
				removeOnComplete: true,
				removeOnFail: true,
			}
		);
	});
});
