import { beforeEach, describe, expect, it, mock } from "bun:test";

type MockPipelineResult = {
	status: "completed" | "skipped" | "error";
	error?: string;
	publicMessagesSent: number;
	retryable: boolean;
	metrics: {
		intakeMs: number;
		decisionMs: number;
		generationMs: number;
		executionMs: number;
		followupMs: number;
		totalMs: number;
	};
};

const defaultPipelineResult: MockPipelineResult = {
	status: "completed",
	publicMessagesSent: 0,
	retryable: false,
	metrics: {
		intakeMs: 0,
		decisionMs: 0,
		generationMs: 0,
		executionMs: 0,
		followupMs: 0,
		totalMs: 0,
	},
};

const runAiAgentPipelineMock = mock(
	async (): Promise<MockPipelineResult> => ({ ...defaultPipelineResult })
);
const updateConversationAiCursorMock = mock(async () => {});

mock.module("@api/ai-pipeline", () => ({
	runAiAgentPipeline: runAiAgentPipelineMock,
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

describe("runPipelineForWindow", () => {
	beforeEach(() => {
		runAiAgentPipelineMock.mockReset();
		updateConversationAiCursorMock.mockReset();

		runAiAgentPipelineMock.mockResolvedValue({ ...defaultPipelineResult });
		updateConversationAiCursorMock.mockResolvedValue(undefined);
	});

	it("processes messages in FIFO order and advances conversation cursor", async () => {
		const { runPipelineForWindow } = await modulePromise;

		const result = await runPipelineForWindow({
			db: {} as never,
			conversation: defaultConversation,
			aiAgentId: "ai-1",
			jobId: "job-1",
			messages: [
				{ id: "msg-1", createdAt: "2026-03-04T10:00:00.000Z" },
				{ id: "msg-2", createdAt: "2026-03-04T10:00:01.000Z" },
			],
		});
		expect(result).toEqual({ processedMessageCount: 2 });

		expect(runAiAgentPipelineMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				input: expect.objectContaining({ messageId: "msg-1" }),
			})
		);
		expect(runAiAgentPipelineMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				input: expect.objectContaining({ messageId: "msg-2" }),
			})
		);
		expect(updateConversationAiCursorMock).toHaveBeenNthCalledWith(
			1,
			expect.anything(),
			{
				conversationId: "conv-1",
				organizationId: "org-1",
				messageId: "msg-1",
				messageCreatedAt: "2026-03-04T10:00:00.000Z",
			}
		);
		expect(updateConversationAiCursorMock).toHaveBeenNthCalledWith(
			2,
			expect.anything(),
			{
				conversationId: "conv-1",
				organizationId: "org-1",
				messageId: "msg-2",
				messageCreatedAt: "2026-03-04T10:00:01.000Z",
			}
		);
	});

	it("throws PipelineWindowError when pipeline returns status=error", async () => {
		runAiAgentPipelineMock.mockResolvedValueOnce({
			status: "error",
			error: "pipeline failed",
			publicMessagesSent: 0,
			retryable: false,
			metrics: {
				intakeMs: 0,
				decisionMs: 0,
				generationMs: 0,
				executionMs: 0,
				followupMs: 0,
				totalMs: 0,
			},
		});

		const { runPipelineForWindow, PipelineWindowError } = await modulePromise;

		await expect(
			runPipelineForWindow({
				db: {} as never,
				conversation: defaultConversation,
				aiAgentId: "ai-1",
				jobId: "job-1",
				messages: [{ id: "msg-1", createdAt: "2026-03-04T10:00:00.000Z" }],
			})
		).rejects.toBeInstanceOf(PipelineWindowError);
		expect(updateConversationAiCursorMock).not.toHaveBeenCalled();
	});
});
