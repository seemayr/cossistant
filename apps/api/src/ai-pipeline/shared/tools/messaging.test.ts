import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PipelineToolContext } from "./contracts";

const sendPublicMessageMock = mock((async () => ({
	messageId: "msg-1",
	created: true,
	paused: false,
})) as (...args: unknown[]) => Promise<{
	messageId: string;
	created: boolean;
	paused: boolean;
}>);

const addInternalNoteMock = mock((async () => ({
	noteId: "note-1",
	created: true,
})) as (...args: unknown[]) => Promise<{ noteId: string; created: boolean }>);

mock.module("../actions/send-message", () => ({
	sendMessage: sendPublicMessageMock,
}));

mock.module("../actions/internal-note", () => ({
	addInternalNote: addInternalNoteMock,
}));

const modulePromise = import("./messaging");

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
	return (
		typeof value === "object" && value !== null && Symbol.asyncIterator in value
	);
}

async function resolveToolResult<T>(value: T | AsyncIterable<T>): Promise<T> {
	if (!isAsyncIterable<T>(value)) {
		return value;
	}

	for await (const chunk of value) {
		return chunk;
	}

	throw new Error("Tool returned an empty async iterable");
}

function createContext(): PipelineToolContext {
	return {
		db: {} as never,
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
		} as never,
		conversationId: "conv-1",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		aiAgentName: "Agent",
		visitorName: "Visitor",
		workflowRunId: "wf-1",
		triggerMessageId: "trigger-1",
		allowPublicMessages: true,
		pipelineKind: "primary",
		mode: "respond_to_visitor",
		isEscalated: false,
		runtimeState: {
			finalAction: null,
			publicMessagesSent: 0,
			toolCallCounts: {},
			successfulToolCallCounts: {},
			failedToolCallCounts: {},
			chargeableToolCallCounts: {},
			publicSendSequence: 0,
			privateSendSequence: 0,
			publicMessageToolSequence: [],
			publicMessageToolCounts: {
				sendAcknowledgeMessage: 0,
				sendMessage: 0,
				sendFollowUpMessage: 0,
			},
			sentPublicMessageIds: new Set<string>(),
			lastToolError: null,
		},
	};
}

describe("public messaging tool contract", () => {
	beforeEach(() => {
		sendPublicMessageMock.mockClear();
		addInternalNoteMock.mockClear();
		sendPublicMessageMock.mockResolvedValue({
			messageId: "msg-1",
			created: true,
			paused: false,
		});
	});

	it("allows ack -> main -> followUp", async () => {
		const {
			createSendAcknowledgeMessageTool,
			createSendFollowUpMessageTool,
			createSendMessageTool,
		} = await modulePromise;
		const ctx = createContext();

		const ack = createSendAcknowledgeMessageTool(ctx);
		const main = createSendMessageTool(ctx);
		const follow = createSendFollowUpMessageTool(ctx);

		if (!(ack.execute && main.execute && follow.execute)) {
			throw new Error("Expected execute handlers for public messaging tools");
		}

		const ackResult = await resolveToolResult(
			await ack.execute({ message: "Let me check." } as never, {} as never)
		);
		const mainResult = await resolveToolResult(
			await main.execute(
				{ message: "Here is the answer." } as never,
				{} as never
			)
		);
		const followResult = await resolveToolResult(
			await follow.execute({ message: "Anything else?" } as never, {} as never)
		);

		expect(ackResult.success).toBe(true);
		expect(mainResult.success).toBe(true);
		expect(followResult.success).toBe(true);
		expect(ctx.runtimeState.publicMessageToolSequence).toEqual([
			"sendAcknowledgeMessage",
			"sendMessage",
			"sendFollowUpMessage",
		]);
		expect(sendPublicMessageMock).toHaveBeenCalledTimes(3);
	});

	it("rejects follow-up before main message", async () => {
		const { createSendFollowUpMessageTool } = await modulePromise;
		const ctx = createContext();
		const follow = createSendFollowUpMessageTool(ctx);
		if (!follow.execute) {
			throw new Error("Expected execute handler for follow-up tool");
		}

		const result = await resolveToolResult(
			await follow.execute({ message: "Following up" } as never, {} as never)
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Invalid public-message sequence");
		expect(sendPublicMessageMock).toHaveBeenCalledTimes(0);
	});

	it("rejects duplicate sendMessage calls in one run", async () => {
		const { createSendMessageTool } = await modulePromise;
		const ctx = createContext();
		const main = createSendMessageTool(ctx);
		if (!main.execute) {
			throw new Error("Expected execute handler for sendMessage tool");
		}

		const first = await resolveToolResult(
			await main.execute({ message: "First" } as never, {} as never)
		);
		const second = await resolveToolResult(
			await main.execute({ message: "Second" } as never, {} as never)
		);

		expect(first.success).toBe(true);
		expect(second.success).toBe(false);
		expect(second.error).toContain("once per run");
		expect(sendPublicMessageMock).toHaveBeenCalledTimes(1);
	});
});
