import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const emitWorkflowStartedMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);

mock.module("@api/ai-agent/events/workflow", () => ({
	emitWorkflowStarted: emitWorkflowStartedMock,
}));

const modulePromise = import("./workflow-events");

describe("workflow start events", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		emitWorkflowStartedMock.mockReset();
		emitWorkflowStartedMock.mockResolvedValue(undefined);
	});

	it("safeEmitWorkflowStarted is fail-open when event emission throws", async () => {
		const { safeEmitWorkflowStarted } = await modulePromise;
		emitWorkflowStartedMock.mockRejectedValueOnce(new Error("event down"));

		await safeEmitWorkflowStarted({
			conversation: {
				id: "conv-1",
			},
			aiAgentId: "ai-1",
			workflowRunId: "wf-1",
			triggerMessageId: "msg-1",
		} as never);

		expect(emitWorkflowStartedMock).toHaveBeenCalledTimes(1);
	});

	it("runWithWorkflowStartedEvent still runs pipeline callback when event emit fails", async () => {
		const { runWithWorkflowStartedEvent } = await modulePromise;
		emitWorkflowStartedMock.mockRejectedValueOnce(new Error("event down"));
		const runPipelineMock = mock(async () => "ok");

		const result = await runWithWorkflowStartedEvent({
			event: {
				conversation: {
					id: "conv-1",
				},
				aiAgentId: "ai-1",
				workflowRunId: "wf-2",
				triggerMessageId: "msg-2",
			} as never,
			run: runPipelineMock,
		});

		expect(result).toBe("ok");
		expect(emitWorkflowStartedMock).toHaveBeenCalledTimes(1);
		expect(runPipelineMock).toHaveBeenCalledTimes(1);
	});
});
