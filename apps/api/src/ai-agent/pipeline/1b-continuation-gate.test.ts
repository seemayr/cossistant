import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getLatestPublicAiMessageAfterCursorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const createModelRawMock = mock((modelId: string) => modelId);
const generateTextMock = mock((async () => ({
	output: {
		decision: "skip",
		reason: "already covered",
		confidence: "high",
	},
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("@api/db/queries/conversation", () => ({
	getLatestPublicAiMessageAfterCursor: getLatestPublicAiMessageAfterCursorMock,
}));

mock.module("@api/lib/ai", () => ({
	createModelRaw: createModelRawMock,
	generateText: generateTextMock,
	Output: {
		object: ({ schema }: { schema: unknown }) => ({ schema }),
	},
}));

const modulePromise = import("./1b-continuation-gate");

describe("continuationGate", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		getLatestPublicAiMessageAfterCursorMock.mockReset();
		createModelRawMock.mockReset();
		generateTextMock.mockReset();

		getLatestPublicAiMessageAfterCursorMock.mockResolvedValue(null);
		generateTextMock.mockResolvedValue({
			output: {
				decision: "skip",
				reason: "already covered",
				confidence: "high",
			},
		});
	});

	it("returns none when trigger is not a public visitor message", async () => {
		const { continuationGate } = await modulePromise;
		const result = await continuationGate({
			db: {} as never,
			conversationId: "conv-1",
			organizationId: "org-1",
			triggerMessageId: "msg-1",
			triggerMessageCreatedAt: new Date().toISOString(),
			triggerMessage: {
				messageId: "msg-1",
				content: "internal note",
				senderType: "human_agent",
				senderId: "user-1",
				senderName: "Sarah",
				timestamp: new Date().toISOString(),
				visibility: "private",
			},
			conversationHistory: [],
		});

		expect(result.decision).toBe("none");
		expect(getLatestPublicAiMessageAfterCursorMock).toHaveBeenCalledTimes(0);
	});

	it("returns none when no newer AI message exists", async () => {
		const { continuationGate } = await modulePromise;
		getLatestPublicAiMessageAfterCursorMock.mockResolvedValue(null);

		const result = await continuationGate({
			db: {} as never,
			conversationId: "conv-1",
			organizationId: "org-1",
			triggerMessageId: "msg-2",
			triggerMessageCreatedAt: new Date().toISOString(),
			triggerMessage: {
				messageId: "msg-2",
				content: "I need help",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: new Date().toISOString(),
				visibility: "public",
			},
			conversationHistory: [],
		});

		expect(result.decision).toBe("none");
		expect(result.reason).toBe("no_newer_public_ai_message");
	});

	it("returns model decision when classifier succeeds", async () => {
		const { continuationGate } = await modulePromise;
		getLatestPublicAiMessageAfterCursorMock.mockResolvedValue({
			id: "ai-msg-1",
			text: "Could you share more details?",
			createdAt: new Date().toISOString(),
		});
		generateTextMock.mockResolvedValue({
			output: {
				decision: "supplement",
				reason: "second visitor sentence adds intent",
				confidence: "medium",
				deltaHint: "Address the second sentence only.",
			},
		});

		const result = await continuationGate({
			db: {} as never,
			conversationId: "conv-1",
			organizationId: "org-1",
			triggerMessageId: "msg-3",
			triggerMessageCreatedAt: new Date().toISOString(),
			triggerMessage: {
				messageId: "msg-3",
				content: "I'm stuck on checkout",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: new Date().toISOString(),
				visibility: "public",
			},
			conversationHistory: [],
		});

		expect(result.decision).toBe("supplement");
		expect(result.deltaHint).toBe("Address the second sentence only.");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("uses conservative fast-path skip for greeting/ack when newer AI asked follow-up", async () => {
		const { continuationGate } = await modulePromise;
		getLatestPublicAiMessageAfterCursorMock.mockResolvedValue({
			id: "ai-msg-2",
			text: "How can I help you today?",
			createdAt: new Date().toISOString(),
		});

		const result = await continuationGate({
			db: {} as never,
			conversationId: "conv-1",
			organizationId: "org-1",
			triggerMessageId: "msg-4",
			triggerMessageCreatedAt: new Date().toISOString(),
			triggerMessage: {
				messageId: "msg-4",
				content: "hello",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: new Date().toISOString(),
				visibility: "public",
			},
			conversationHistory: [],
		});

		expect(result.decision).toBe("skip");
		expect(result.reason).toBe("heuristic_skip_ack_followup");
		expect(generateTextMock).toHaveBeenCalledTimes(0);
	});

	it("falls back to neutral for ambiguous trigger when classifier fails", async () => {
		const { continuationGate } = await modulePromise;
		getLatestPublicAiMessageAfterCursorMock.mockResolvedValue({
			id: "ai-msg-3",
			text: "Thanks! Let me know if anything else comes up.",
			createdAt: new Date().toISOString(),
		});
		generateTextMock.mockRejectedValue(new Error("timeout"));

		const result = await continuationGate({
			db: {} as never,
			conversationId: "conv-1",
			organizationId: "org-1",
			triggerMessageId: "msg-5",
			triggerMessageCreatedAt: new Date().toISOString(),
			triggerMessage: {
				messageId: "msg-5",
				content: "I can't complete the payment flow",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: new Date().toISOString(),
				visibility: "public",
			},
			conversationHistory: [],
		});

		expect(result.decision).toBe("none");
		expect(result.reason.startsWith("fallback_none")).toBe(true);
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});
});
