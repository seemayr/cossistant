import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getAiAgentByIdMock = mock(async () => ({
	id: "ai-1",
	model: "moonshotai/kimi-k2-0905",
	isActive: true,
}));
const updateAiAgentModelMock = mock(async () => null);
const getConversationByIdMock = mock(async () => ({
	id: "conv-1",
}));
const getMessageMetadataMock = mock(async () => ({
	id: "msg-1",
	createdAt: "2025-01-01T00:00:00.000Z",
}));
const buildConversationHistoryMock = mock(async () => [
	{
		messageId: "msg-1",
		content: "hello",
		senderType: "visitor",
		visibility: "public",
	},
]);
const getVisitorContextMock = mock(async () => null);

mock.module("@api/db/queries/ai-agent", () => ({
	getAiAgentById: getAiAgentByIdMock,
	updateAiAgentModel: updateAiAgentModelMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getMessageMetadata: getMessageMetadataMock,
}));

mock.module("../context/conversation", () => ({
	buildConversationHistory: buildConversationHistoryMock,
}));

mock.module("../context/visitor", () => ({
	getVisitorContext: getVisitorContextMock,
}));

const modulePromise = import("./1-intake");

function buildInput() {
	return {
		aiAgentId: "ai-1",
		conversationId: "conv-1",
		messageId: "msg-1",
		messageCreatedAt: "2025-01-01T00:00:00.000Z",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		workflowRunId: "wf-1",
		jobId: "job-1",
	};
}

type MockHistoryMessage = {
	messageId: string;
	content: string;
	senderType: string;
	visibility: string;
};

async function flushMicrotasks(times = 4): Promise<void> {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

function createDbStub() {
	let selectCallCount = 0;
	const db = {
		select: () => {
			selectCallCount++;
			return {
				from: () => ({
					where: async () => [],
				}),
			};
		},
	};
	return {
		db,
		getSelectCallCount: () => selectCallCount,
	};
}

describe("intake", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		getAiAgentByIdMock.mockReset();
		updateAiAgentModelMock.mockReset();
		getConversationByIdMock.mockReset();
		getMessageMetadataMock.mockReset();
		buildConversationHistoryMock.mockReset();
		getVisitorContextMock.mockReset();

		getAiAgentByIdMock.mockResolvedValue({
			id: "ai-1",
			model: "moonshotai/kimi-k2-0905",
			isActive: true,
		});
		updateAiAgentModelMock.mockResolvedValue(null);
		getConversationByIdMock.mockResolvedValue({
			id: "conv-1",
		});
		getMessageMetadataMock.mockResolvedValue({
			id: "msg-1",
			createdAt: "2025-01-01T00:00:00.000Z",
		});
		buildConversationHistoryMock.mockResolvedValue([
			{
				messageId: "msg-1",
				content: "hello",
				senderType: "visitor",
				visibility: "public",
			},
		]);
		getVisitorContextMock.mockResolvedValue(null);
	});

	it("starts conversation and trigger metadata queries in parallel", async () => {
		const { intake } = await modulePromise;
		let resolveConversation!: (value: { id: string }) => void;
		getConversationByIdMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveConversation = (value) => resolve(value);
				})
		);
		const { db } = createDbStub();

		const intakePromise = intake(db as never, buildInput() as never);

		await flushMicrotasks();
		expect(getMessageMetadataMock).toHaveBeenCalledTimes(1);

		resolveConversation({ id: "conv-1" });
		const result = await intakePromise;
		expect(result.status).toBe("ready");
	});

	it("starts conversation state fetch without waiting for history fetch", async () => {
		const { intake } = await modulePromise;
		let resolveHistory!: (value: MockHistoryMessage[]) => void;
		buildConversationHistoryMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveHistory = (value) => resolve(value);
				})
		);
		const { db, getSelectCallCount } = createDbStub();

		const intakePromise = intake(db as never, buildInput() as never);

		await flushMicrotasks();
		expect(getSelectCallCount()).toBe(2);

		resolveHistory([
			{
				messageId: "msg-1",
				content: "hello",
				senderType: "visitor",
				visibility: "public",
			},
		]);

		const result = await intakePromise;
		expect(result.status).toBe("ready");
	});
});
