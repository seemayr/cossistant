import { beforeEach, describe, expect, it, mock } from "bun:test";

const redisMock = {} as never;
const dbMock = {} as never;

const getRedisMock = mock(() => redisMock);
const getActiveAiAgentForWebsiteMock = mock(
	async () => ({ id: "ai-1" }) as { id: string } | null
);
const isAiPausedForConversationMock = mock(async () => false);
const updateConversationAiCursorMock = mock(async () => {});
const enqueueAiAgentMessageMock = mock(async () => ({ added: true }));
const enqueueAiAgentJobMock = mock(async () => ({
	status: "created" as const,
}));
const getAiAgentQueueTriggersMock = mock(() => ({
	enqueueAiAgentJob: enqueueAiAgentJobMock,
}));
const clearAiAgentWakeNeededMock = mock(async () => {});
const markAiAgentWakeNeededMock = mock(async () => {});

mock.module("@api/db", () => ({
	db: dbMock,
}));

mock.module("@api/redis", () => ({
	getRedis: getRedisMock,
}));

mock.module("@api/db/queries/ai-agent", () => ({
	getActiveAiAgentForWebsite: getActiveAiAgentForWebsiteMock,
}));

mock.module("@api/ai-agent/kill-switch", () => ({
	isAiPausedForConversation: isAiPausedForConversationMock,
}));

mock.module("@api/db/mutations/conversation", () => ({
	updateConversationAiCursor: updateConversationAiCursorMock,
}));

mock.module("@api/utils/queue-triggers", () => ({
	getAiAgentQueueTriggers: getAiAgentQueueTriggersMock,
}));

mock.module("@cossistant/jobs", () => ({
	enqueueAiAgentMessage: enqueueAiAgentMessageMock,
	clearAiAgentWakeNeeded: clearAiAgentWakeNeededMock,
	markAiAgentWakeNeeded: markAiAgentWakeNeededMock,
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
		isAiPausedForConversationMock.mockReset();
		updateConversationAiCursorMock.mockReset();
		enqueueAiAgentMessageMock.mockReset();
		enqueueAiAgentJobMock.mockReset();
		getAiAgentQueueTriggersMock.mockReset();
		clearAiAgentWakeNeededMock.mockReset();
		markAiAgentWakeNeededMock.mockReset();

		getRedisMock.mockReturnValue(redisMock);
		getActiveAiAgentForWebsiteMock.mockResolvedValue({ id: "ai-1" });
		isAiPausedForConversationMock.mockResolvedValue(false);
		updateConversationAiCursorMock.mockResolvedValue(undefined);
		enqueueAiAgentMessageMock.mockResolvedValue({ added: true });
		enqueueAiAgentJobMock.mockResolvedValue({ status: "created" as const });
		getAiAgentQueueTriggersMock.mockReturnValue({
			enqueueAiAgentJob: enqueueAiAgentJobMock,
		});
		clearAiAgentWakeNeededMock.mockResolvedValue(undefined);
		markAiAgentWakeNeededMock.mockResolvedValue(undefined);
	});

	it("returns skipped when there is no active AI agent", async () => {
		getActiveAiAgentForWebsiteMock.mockResolvedValue(null);
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "skipped",
			reason: "no_active_agent",
			recoveryMarked: false,
		});
		expect(enqueueAiAgentMessageMock).not.toHaveBeenCalled();
		expect(enqueueAiAgentJobMock).not.toHaveBeenCalled();
	});

	it("advances cursor and skips enqueueing when conversation is paused", async () => {
		isAiPausedForConversationMock.mockResolvedValue(true);
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "skipped",
			reason: "paused",
			recoveryMarked: false,
			aiAgentId: "ai-1",
		});
		expect(updateConversationAiCursorMock).toHaveBeenCalledTimes(1);
		expect(enqueueAiAgentMessageMock).not.toHaveBeenCalled();
		expect(enqueueAiAgentJobMock).not.toHaveBeenCalled();
	});

	it("returns queued when message is newly enqueued and wake is created", async () => {
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "queued",
			recoveryMarked: false,
			aiAgentId: "ai-1",
		});
		expect(enqueueAiAgentMessageMock).toHaveBeenCalledTimes(1);
		expect(enqueueAiAgentJobMock).toHaveBeenCalledTimes(1);
		expect(clearAiAgentWakeNeededMock).toHaveBeenCalledWith(
			redisMock,
			defaultParams.conversationId
		);
	});

	it("marks wake-needed after bounded retries when enqueue/wake keeps failing", async () => {
		enqueueAiAgentMessageMock.mockRejectedValue(new Error("redis unavailable"));
		const { enqueueAiAgentTrigger } = await aiTriggerServiceModulePromise;

		const result = await enqueueAiAgentTrigger(defaultParams);

		expect(result).toEqual({
			status: "recoveryMarked",
			recoveryMarked: true,
			aiAgentId: "ai-1",
		});
		expect(enqueueAiAgentMessageMock).toHaveBeenCalledTimes(3);
		expect(markAiAgentWakeNeededMock).toHaveBeenCalledWith(redisMock, {
			conversationId: defaultParams.conversationId,
			ttlSeconds: 300,
		});
	});
});
