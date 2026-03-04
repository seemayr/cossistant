import { beforeEach, describe, expect, it, mock } from "bun:test";

const redisMock = {} as never;
const dbMock = {} as never;

const getRedisMock = mock(() => redisMock);
const getActiveAiAgentForWebsiteMock = mock(
	async () => ({ id: "ai-1" }) as { id: string } | null
);
const setAiAgentRunCursorIfAbsentMock = mock(async () => true);
const enqueueAiAgentJobMock = mock(
	async (): Promise<
		{ status: "created" } | { status: "skipped"; existingState: string }
	> => ({
		status: "created",
	})
);
const getAiAgentQueueTriggersMock = mock(() => ({
	enqueueAiAgentJob: enqueueAiAgentJobMock,
}));

mock.module("@api/db", () => ({
	db: dbMock,
}));

mock.module("@api/redis", () => ({
	getRedis: getRedisMock,
}));

mock.module("@api/db/queries/ai-agent", () => ({
	getActiveAiAgentForWebsite: getActiveAiAgentForWebsiteMock,
}));

mock.module("@api/utils/queue-triggers", () => ({
	getAiAgentQueueTriggers: getAiAgentQueueTriggersMock,
}));

mock.module("@cossistant/jobs", () => ({
	AI_AGENT_INITIAL_DELAY_MS: 5000,
	setAiAgentRunCursorIfAbsent: setAiAgentRunCursorIfAbsentMock,
}));

const aiTriggerServiceModulePromise = import("./ai-trigger-service");

const defaultParams = {
	conversationId: "conv-1",
	messageId: "msg-1",
	messageCreatedAt: "2026-02-25T10:00:00.000Z",
	websiteId: "site-1",
	organizationId: "org-1",
};

describe("enqueueAiAgentTrigger", () => {
	beforeEach(() => {
		getRedisMock.mockReset();
		getActiveAiAgentForWebsiteMock.mockReset();
		setAiAgentRunCursorIfAbsentMock.mockReset();
		enqueueAiAgentJobMock.mockReset();
		getAiAgentQueueTriggersMock.mockReset();

		getRedisMock.mockReturnValue(redisMock);
		getActiveAiAgentForWebsiteMock.mockResolvedValue({ id: "ai-1" });
		setAiAgentRunCursorIfAbsentMock.mockResolvedValue(true);
		enqueueAiAgentJobMock.mockResolvedValue({ status: "created" });
		getAiAgentQueueTriggersMock.mockReturnValue({
			enqueueAiAgentJob: enqueueAiAgentJobMock,
		});
	});

	it("returns skipped when there is no active AI agent", async () => {
		getActiveAiAgentForWebsiteMock.mockResolvedValue(null);
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "skipped",
			reason: "no_active_agent",
		});
		expect(setAiAgentRunCursorIfAbsentMock).not.toHaveBeenCalled();
		expect(enqueueAiAgentJobMock).not.toHaveBeenCalled();
	});

	it("sets run cursor and enqueues delayed conversation job", async () => {
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "queued",
			aiAgentId: "ai-1",
		});
		expect(setAiAgentRunCursorIfAbsentMock).toHaveBeenCalledWith(redisMock, {
			conversationId: "conv-1",
			messageId: "msg-1",
			messageCreatedAt: "2026-02-25T10:00:00.000Z",
		});
		expect(enqueueAiAgentJobMock).toHaveBeenCalledWith(
			{
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				runAttempt: 0,
			},
			{ delayMs: 5000 }
		);
	});

	it("returns alreadyQueued when a conversation job is already in-flight", async () => {
		enqueueAiAgentJobMock.mockResolvedValueOnce({
			status: "skipped",
			existingState: "active",
		});
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "alreadyQueued",
			aiAgentId: "ai-1",
		});
		expect(setAiAgentRunCursorIfAbsentMock).toHaveBeenCalledTimes(1);
		expect(enqueueAiAgentJobMock).toHaveBeenCalledTimes(1);
	});
});
