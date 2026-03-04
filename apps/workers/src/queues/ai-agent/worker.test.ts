import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type {
	AiAgentBackgroundJobData,
	AiAgentJobData,
} from "@cossistant/jobs";

type MockJob<T> = {
	id: string;
	attemptsMade: number;
	data: T;
};

type MockRunCursor = {
	messageId: string;
	messageCreatedAt: string;
};

type MockConversation = {
	id: string;
	websiteId: string;
	organizationId: string;
	visitorId: string;
	aiAgentLastProcessedMessageCreatedAt: string | null;
	aiAgentLastProcessedMessageId: string | null;
};

type MockWindowMessage = {
	id: string;
	createdAt: string;
};

let processor:
	| ((
			job: MockJob<AiAgentJobData>
	  ) => Promise<{ hadCursor: boolean; processedMessageCount: number }>)
	| null = null;
let completedHandler:
	| ((
			job: MockJob<AiAgentJobData>,
			result: { hadCursor: boolean; processedMessageCount: number }
	  ) => void)
	| null = null;
let failedHandler:
	| ((job: MockJob<AiAgentJobData>, error: Error) => void)
	| null = null;

const workerWaitUntilReadyMock = mock(async () => {});
const workerCloseMock = mock(async () => {});
const queueWaitUntilReadyMock = mock(async () => {});
const queueCloseMock = mock(async () => {});

class MockWorker<T> {
	waitUntilReady = workerWaitUntilReadyMock;
	close = workerCloseMock;

	constructor(
		_queueName: string,
		processorFn: (
			job: MockJob<T>
		) => Promise<{ hadCursor: boolean; processedMessageCount: number }>
	) {
		processor = processorFn as typeof processor;
	}

	on(
		event: string,
		handler:
			| ((
					job: MockJob<AiAgentJobData>,
					result: { hadCursor: boolean; processedMessageCount: number }
			  ) => void)
			| ((job: MockJob<AiAgentJobData>, error: Error) => void)
	) {
		if (event === "completed") {
			completedHandler = handler as typeof completedHandler;
		}
		if (event === "failed") {
			failedHandler = handler as typeof failedHandler;
		}
	}
}

class MockQueue<T> {
	waitUntilReady = queueWaitUntilReadyMock;
	close = queueCloseMock;
}

const getConversationByIdMock = mock(
	async (): Promise<MockConversation | null> => null
);
const getAiAgentRunCursorMock = mock(
	async (): Promise<MockRunCursor | null> => null
);
const setAiAgentRunCursorMock = mock(async (): Promise<void> => {});
const clearAiAgentRunCursorMock = mock(async (): Promise<void> => {});
const clearAiAgentRunCursorIfMatchesMock = mock(
	async (): Promise<boolean> => true
);
const buildMessageWindowFromCursorMock = mock(
	async (): Promise<MockWindowMessage[]> => []
);
const findNextTriggerableMessageAfterCursorMock = mock(
	async (): Promise<MockWindowMessage | null> => null
);
const runPipelineForWindowMock = mock(
	async (): Promise<{ processedMessageCount: number }> => ({
		processedMessageCount: 1,
	})
);
const enqueueConversationScopedAiJobMock = mock(
	async (): Promise<
		{ status: "created" } | { status: "skipped"; existingState: string }
	> => ({
		status: "created",
	})
);
const enqueueConversationScopedAiBackgroundJobMock = mock(
	async (): Promise<
		| { status: "created" }
		| { status: "rescheduled"; previousState: "delayed" | "waiting" }
		| { status: "skipped_active" }
		| { status: "skipped_unexpected"; existingState: string }
	> => ({
		status: "created",
	})
);

class PipelineWindowError extends Error {
	failedMessage: { id: string; createdAt: string };
	constructor(
		message: string,
		failedMessage: { id: string; createdAt: string }
	) {
		super(message);
		this.failedMessage = failedMessage;
	}
}

mock.module("bullmq", () => ({
	Worker: MockWorker,
	Queue: MockQueue,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
}));

mock.module("@cossistant/jobs", () => ({
	QUEUE_NAMES: {
		AI_AGENT: "ai-agent",
		AI_AGENT_BACKGROUND: "ai-agent-background",
	},
	AI_AGENT_BACKGROUND_DELAY_MS: 60_000,
	AI_AGENT_INITIAL_DELAY_MS: 5000,
	AI_AGENT_RETRY_DELAY_MS: 5000,
	AI_AGENT_MAX_RUN_ATTEMPTS: 3,
	getAiAgentRunCursor: getAiAgentRunCursorMock,
	setAiAgentRunCursor: setAiAgentRunCursorMock,
	clearAiAgentRunCursor: clearAiAgentRunCursorMock,
	clearAiAgentRunCursorIfMatches: clearAiAgentRunCursorIfMatchesMock,
	enqueueConversationScopedAiBackgroundJob:
		enqueueConversationScopedAiBackgroundJobMock,
	enqueueConversationScopedAiJob: enqueueConversationScopedAiJobMock,
}));

mock.module("./message-window", () => ({
	buildMessageWindowFromCursor: buildMessageWindowFromCursorMock,
	findNextTriggerableMessageAfterCursor:
		findNextTriggerableMessageAfterCursorMock,
}));

mock.module("./pipeline-runner", () => ({
	PipelineWindowError,
	runPipelineForWindow: runPipelineForWindowMock,
}));

mock.module("@workers/db", () => ({ db: {} }));
mock.module("@workers/env", () => ({ env: { AI_AGENT_CONCURRENCY: 7 } }));
mock.module("@cossistant/redis", () => ({
	getSafeRedisUrl: () => "redis://masked",
}));

const modulePromise = import("./worker");

function buildJobData(overrides: Partial<AiAgentJobData> = {}): AiAgentJobData {
	return {
		conversationId: "conv-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		...overrides,
	};
}

async function runJob(data: AiAgentJobData) {
	if (!processor) {
		throw new Error("processor not initialized");
	}
	const job: MockJob<AiAgentJobData> = {
		id: "job-1",
		attemptsMade: 0,
		data,
	};

	try {
		const result = await processor(job);
		completedHandler?.(job, result);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		return result;
	} catch (error) {
		failedHandler?.(job, error as Error);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		throw error;
	}
}

describe("ai-agent worker cursor orchestration", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		processor = null;
		completedHandler = null;
		failedHandler = null;

		workerWaitUntilReadyMock.mockReset();
		workerCloseMock.mockReset();
		queueWaitUntilReadyMock.mockReset();
		queueCloseMock.mockReset();
		getConversationByIdMock.mockReset();
		getAiAgentRunCursorMock.mockReset();
		setAiAgentRunCursorMock.mockReset();
		clearAiAgentRunCursorMock.mockReset();
		clearAiAgentRunCursorIfMatchesMock.mockReset();
		buildMessageWindowFromCursorMock.mockReset();
		findNextTriggerableMessageAfterCursorMock.mockReset();
		runPipelineForWindowMock.mockReset();
		enqueueConversationScopedAiJobMock.mockReset();
		enqueueConversationScopedAiBackgroundJobMock.mockReset();

		workerWaitUntilReadyMock.mockResolvedValue(undefined);
		workerCloseMock.mockResolvedValue(undefined);
		queueWaitUntilReadyMock.mockResolvedValue(undefined);
		queueCloseMock.mockResolvedValue(undefined);
		getAiAgentRunCursorMock.mockResolvedValue(null);
		buildMessageWindowFromCursorMock.mockResolvedValue([]);
		findNextTriggerableMessageAfterCursorMock.mockResolvedValue(null);
		runPipelineForWindowMock.mockResolvedValue({ processedMessageCount: 1 });
		clearAiAgentRunCursorIfMatchesMock.mockResolvedValue(true);
		enqueueConversationScopedAiJobMock.mockResolvedValue({ status: "created" });
		enqueueConversationScopedAiBackgroundJobMock.mockResolvedValue({
			status: "created",
		});
	});

	it("no-ops when run cursor is missing", async () => {
		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
			stateRedis: {} as never,
		});

		await worker.start();
		await runJob(buildJobData());

		expect(runPipelineForWindowMock).not.toHaveBeenCalled();
		expect(enqueueConversationScopedAiJobMock).not.toHaveBeenCalled();
		expect(enqueueConversationScopedAiBackgroundJobMock).not.toHaveBeenCalled();

		await worker.stop();
	});

	it("clears run cursor when conversation is missing", async () => {
		getAiAgentRunCursorMock.mockResolvedValue({
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		getConversationByIdMock.mockResolvedValue(null);

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
			stateRedis: {} as never,
		});

		await worker.start();
		await runJob(buildJobData());

		expect(clearAiAgentRunCursorMock).toHaveBeenCalledWith(
			expect.anything(),
			"conv-1"
		);
		expect(runPipelineForWindowMock).not.toHaveBeenCalled();
		expect(enqueueConversationScopedAiBackgroundJobMock).not.toHaveBeenCalled();

		await worker.stop();
	});

	it("does not clear cursor on completion when compare-and-clear does not match", async () => {
		getAiAgentRunCursorMock.mockResolvedValue({
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		getConversationByIdMock
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
				aiAgentLastProcessedMessageId: "msg-1",
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
				aiAgentLastProcessedMessageId: "msg-1",
			});
		buildMessageWindowFromCursorMock.mockResolvedValue([
			{ id: "msg-1", createdAt: "2026-03-04T10:00:00.000Z" },
		]);
		findNextTriggerableMessageAfterCursorMock.mockResolvedValue(null);
		clearAiAgentRunCursorIfMatchesMock.mockResolvedValue(false);

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
			stateRedis: {} as never,
		});

		await worker.start();
		await runJob(buildJobData());

		expect(clearAiAgentRunCursorIfMatchesMock).toHaveBeenCalledWith(
			expect.anything(),
			{
				conversationId: "conv-1",
				messageId: "msg-1",
				messageCreatedAt: "2026-03-04T10:00:00.000Z",
			}
		);
		expect(clearAiAgentRunCursorMock).not.toHaveBeenCalled();
		expect(enqueueConversationScopedAiBackgroundJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
			},
			delayMs: 60_000,
		});

		await worker.stop();
	});

	it("schedules immediate follow-up on completion when newer triggerable message exists", async () => {
		getAiAgentRunCursorMock.mockResolvedValue({
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		getConversationByIdMock
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
				aiAgentLastProcessedMessageId: "msg-1",
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:01.000Z",
				aiAgentLastProcessedMessageId: "msg-2",
			});
		buildMessageWindowFromCursorMock.mockResolvedValue([
			{ id: "msg-1", createdAt: "2026-03-04T10:00:00.000Z" },
		]);
		findNextTriggerableMessageAfterCursorMock.mockResolvedValue({
			id: "msg-3",
			createdAt: "2026-03-04T10:00:02.000Z",
		});

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
			stateRedis: {} as never,
		});

		await worker.start();
		await runJob(buildJobData());

		expect(setAiAgentRunCursorMock).toHaveBeenCalledWith(expect.anything(), {
			conversationId: "conv-1",
			messageId: "msg-3",
			messageCreatedAt: "2026-03-04T10:00:02.000Z",
		});
		expect(enqueueConversationScopedAiJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				runAttempt: 0,
			},
			delayMs: 0,
		});
		expect(enqueueConversationScopedAiBackgroundJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
			},
			delayMs: 60_000,
		});

		await worker.stop();
	});

	it("retries failed run with delay and clears cursor after max attempts", async () => {
		getAiAgentRunCursorMock.mockResolvedValue({
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		getConversationByIdMock.mockResolvedValue({
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			aiAgentLastProcessedMessageCreatedAt: null,
			aiAgentLastProcessedMessageId: null,
		});
		buildMessageWindowFromCursorMock.mockResolvedValue([
			{ id: "msg-1", createdAt: "2026-03-04T10:00:00.000Z" },
		]);
		runPipelineForWindowMock.mockRejectedValue(
			new PipelineWindowError("boom", {
				id: "msg-1",
				createdAt: "2026-03-04T10:00:00.000Z",
			})
		);

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
			stateRedis: {} as never,
		});
		await worker.start();

		await expect(runJob(buildJobData({ runAttempt: 0 }))).rejects.toThrow(
			"boom"
		);
		expect(setAiAgentRunCursorMock).toHaveBeenCalledWith(expect.anything(), {
			conversationId: "conv-1",
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		expect(enqueueConversationScopedAiJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				runAttempt: 1,
			},
			delayMs: 5000,
		});
		expect(enqueueConversationScopedAiBackgroundJobMock).not.toHaveBeenCalled();

		enqueueConversationScopedAiJobMock.mockReset();
		await expect(runJob(buildJobData({ runAttempt: 2 }))).rejects.toThrow(
			"boom"
		);
		expect(enqueueConversationScopedAiJobMock).not.toHaveBeenCalled();
		expect(clearAiAgentRunCursorMock).toHaveBeenCalledWith(
			expect.anything(),
			"conv-1"
		);
		expect(enqueueConversationScopedAiBackgroundJobMock).not.toHaveBeenCalled();

		await worker.stop();
	});

	it("does not schedule background job when processed message count is zero", async () => {
		getAiAgentRunCursorMock.mockResolvedValue({
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		getConversationByIdMock.mockResolvedValue({
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
			aiAgentLastProcessedMessageId: "msg-1",
		});
		buildMessageWindowFromCursorMock.mockResolvedValue([
			{ id: "msg-1", createdAt: "2026-03-04T10:00:00.000Z" },
		]);
		findNextTriggerableMessageAfterCursorMock.mockResolvedValue(null);
		runPipelineForWindowMock.mockResolvedValueOnce({
			processedMessageCount: 0,
		});

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
			stateRedis: {} as never,
		});

		await worker.start();
		await runJob(buildJobData());

		expect(enqueueConversationScopedAiBackgroundJobMock).not.toHaveBeenCalled();

		await worker.stop();
	});

	it("handles skipped_active when background job is already running", async () => {
		getAiAgentRunCursorMock.mockResolvedValue({
			messageId: "msg-1",
			messageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		getConversationByIdMock.mockResolvedValue({
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
			aiAgentLastProcessedMessageId: "msg-1",
		});
		buildMessageWindowFromCursorMock.mockResolvedValue([
			{ id: "msg-1", createdAt: "2026-03-04T10:00:00.000Z" },
		]);
		findNextTriggerableMessageAfterCursorMock.mockResolvedValue(null);
		enqueueConversationScopedAiBackgroundJobMock.mockResolvedValueOnce({
			status: "skipped_active",
		});

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
			stateRedis: {} as never,
		});

		await worker.start();
		await runJob(buildJobData());

		expect(enqueueConversationScopedAiBackgroundJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
			},
			delayMs: 60_000,
		});

		await worker.stop();
	});
});
