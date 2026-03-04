import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Queue } from "bullmq";
import {
	AI_AGENT_INITIAL_DELAY_MS,
	enqueueConversationScopedAiJob,
} from "./ai-agent-job-scheduler";
import type { AiAgentJobData } from "./types";

type MockJobState = "active" | "waiting" | "delayed" | "completed" | "failed";

function buildJobData(overrides: Partial<AiAgentJobData> = {}): AiAgentJobData {
	return {
		conversationId: "conv-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		...overrides,
	};
}

describe("enqueueConversationScopedAiJob", () => {
	let existingState: MockJobState | null;
	let removeCount: number;
	const addMock = mock(
		async (_name: string, _data: AiAgentJobData, _options: unknown) => ({
			id: "job-1",
		})
	);
	const getJobMock = mock(async (_jobId: string) => null);

	function buildQueue(): Queue<AiAgentJobData> {
		return {
			add: addMock,
			getJob: getJobMock,
		} as unknown as Queue<AiAgentJobData>;
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
				id: "ai-agent-conv-1",
				getState: async () => existingState,
				remove: async () => {
					removeCount += 1;
					existingState = null;
				},
			};
		});
	});

	it("creates a job with default delay when no existing conversation job", async () => {
		const result = await enqueueConversationScopedAiJob({
			queue: buildQueue(),
			data: buildJobData(),
		});

		expect(result).toEqual({ status: "created" });
		expect(addMock).toHaveBeenCalledWith("ai-agent", buildJobData(), {
			attempts: 1,
			delay: AI_AGENT_INITIAL_DELAY_MS,
			jobId: "ai-agent-conv-1",
			removeOnComplete: true,
			removeOnFail: true,
		});
	});

	it("skips enqueue for active/waiting/delayed existing job", async () => {
		for (const state of ["active", "waiting", "delayed"] as const) {
			existingState = state;
			const result = await enqueueConversationScopedAiJob({
				queue: buildQueue(),
				data: buildJobData(),
			});
			expect(result).toEqual({ status: "skipped", existingState: state });
		}
		expect(addMock).not.toHaveBeenCalled();
		expect(removeCount).toBe(0);
	});

	it("removes completed/failed existing job before creating a new one", async () => {
		for (const state of ["completed", "failed"] as const) {
			existingState = state;
			const result = await enqueueConversationScopedAiJob({
				queue: buildQueue(),
				data: buildJobData(),
			});
			expect(result).toEqual({ status: "created" });
		}
		expect(removeCount).toBe(2);
		expect(addMock).toHaveBeenCalledTimes(2);
	});

	it("honors explicit delay override", async () => {
		await enqueueConversationScopedAiJob({
			queue: buildQueue(),
			data: buildJobData(),
			delayMs: 0,
		});

		expect(addMock).toHaveBeenCalledWith("ai-agent", buildJobData(), {
			attempts: 1,
			delay: 0,
			jobId: "ai-agent-conv-1",
			removeOnComplete: true,
			removeOnFail: true,
		});
	});
});
