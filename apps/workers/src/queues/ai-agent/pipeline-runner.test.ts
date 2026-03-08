import { beforeEach, describe, expect, it, mock } from "bun:test";

type MockPipelineResult = {
	status: "completed" | "skipped" | "error";
	error?: string;
	reason?: string;
	cursorDisposition: "advance" | "retry";
	publicMessagesSent: number;
	retryable: boolean;
	metrics: {
		intakeMs: number;
		decisionMs: number;
		generationMs: number;
		totalMs: number;
	};
};

const defaultPipelineResult: MockPipelineResult = {
	status: "completed",
	cursorDisposition: "advance",
	publicMessagesSent: 0,
	retryable: false,
	metrics: {
		intakeMs: 0,
		decisionMs: 0,
		generationMs: 0,
		totalMs: 0,
	},
};

const runPrimaryPipelineMock = mock(
	async (): Promise<MockPipelineResult> => ({ ...defaultPipelineResult })
);
const updateConversationAiCursorMock = mock(async () => {});

mock.module("@api/ai-pipeline", () => ({
	runPrimaryPipeline: runPrimaryPipelineMock,
}));

mock.module("@api/db/mutations/conversation", () => ({
	updateConversationAiCursor: updateConversationAiCursorMock,
}));

const modulePromise = import("./pipeline-runner");

const defaultConversation = {
	id: "conv-1",
	websiteId: "site-1",
	organizationId: "org-1",
	visitorId: "visitor-1",
};

const defaultMessage = {
	id: "msg-1",
	createdAt: "2026-03-04T10:00:00.000Z",
};

describe("runPipelineForMessage", () => {
	beforeEach(() => {
		runPrimaryPipelineMock.mockReset();
		updateConversationAiCursorMock.mockReset();

		runPrimaryPipelineMock.mockResolvedValue({ ...defaultPipelineResult });
		updateConversationAiCursorMock.mockResolvedValue(undefined);
	});

	it("processes one message and advances the conversation cursor", async () => {
		const { runPipelineForMessage } = await modulePromise;

		const result = await runPipelineForMessage({
			db: {} as never,
			conversation: defaultConversation,
			aiAgentId: "ai-1",
			jobId: "job-1",
			message: defaultMessage,
		});

		expect(result).toEqual({
			processedMessageId: "msg-1",
			processedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		expect(runPrimaryPipelineMock).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({ messageId: "msg-1" }),
			})
		);
		expect(updateConversationAiCursorMock).toHaveBeenCalledWith(
			expect.anything(),
			{
				conversationId: "conv-1",
				organizationId: "org-1",
				messageId: "msg-1",
				messageCreatedAt: "2026-03-04T10:00:00.000Z",
			}
		);
	});

	it("throws PipelineMessageError when pipeline requests retry", async () => {
		runPrimaryPipelineMock.mockResolvedValueOnce({
			status: "error",
			error: "pipeline failed",
			cursorDisposition: "retry",
			publicMessagesSent: 0,
			retryable: false,
			metrics: {
				intakeMs: 0,
				decisionMs: 0,
				generationMs: 0,
				totalMs: 0,
			},
		});

		const { runPipelineForMessage, PipelineMessageError } = await modulePromise;

		await expect(
			runPipelineForMessage({
				db: {} as never,
				conversation: defaultConversation,
				aiAgentId: "ai-1",
				jobId: "job-1",
				message: defaultMessage,
			})
		).rejects.toBeInstanceOf(PipelineMessageError);
		expect(updateConversationAiCursorMock).not.toHaveBeenCalled();
	});

	it("advances cursor for explicit skipped attachment-only turns", async () => {
		runPrimaryPipelineMock.mockResolvedValueOnce({
			status: "skipped",
			reason: "Attachment-only message skipped",
			cursorDisposition: "advance",
			publicMessagesSent: 0,
			retryable: false,
			metrics: {
				intakeMs: 0,
				decisionMs: 0,
				generationMs: 0,
				totalMs: 0,
			},
		});

		const { runPipelineForMessage } = await modulePromise;

		const result = await runPipelineForMessage({
			db: {} as never,
			conversation: defaultConversation,
			aiAgentId: "ai-1",
			jobId: "job-skip",
			message: defaultMessage,
		});

		expect(result).toEqual({
			processedMessageId: "msg-1",
			processedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		expect(updateConversationAiCursorMock).toHaveBeenCalledTimes(1);
	});

	it("advances cursor for terminal non-retryable errors that request advance", async () => {
		runPrimaryPipelineMock.mockResolvedValueOnce({
			status: "error",
			error: "public reply already sent; do not retry",
			cursorDisposition: "advance",
			publicMessagesSent: 1,
			retryable: false,
			metrics: {
				intakeMs: 0,
				decisionMs: 0,
				generationMs: 0,
				totalMs: 0,
			},
		});

		const { runPipelineForMessage } = await modulePromise;

		const result = await runPipelineForMessage({
			db: {} as never,
			conversation: defaultConversation,
			aiAgentId: "ai-1",
			jobId: "job-terminal",
			message: defaultMessage,
		});

		expect(result).toEqual({
			processedMessageId: "msg-1",
			processedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
		});
		expect(updateConversationAiCursorMock).toHaveBeenCalledTimes(1);
	});
});
