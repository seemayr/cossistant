import { beforeEach, describe, expect, it, mock } from "bun:test";

type MockHistoryMessage = {
	messageId: string;
	content: string;
	senderType: "visitor" | "human_agent" | "ai_agent";
	senderId: string | null;
	senderName: string | null;
	timestamp: string;
	visibility: "public" | "private";
};

type MockPublicAiMessage = {
	id: string;
	text: string;
	createdAt: string;
};

const getConversationByIdMock = mock(async () => null);
const getMessageMetadataMock = mock(async () => null);
const getPublicAiMessagesAfterCursorMock = mock(
	(async (): Promise<MockPublicAiMessage[]> => []) as (
		...args: unknown[]
	) => Promise<MockPublicAiMessage[]>
);
const getCompleteVisitorWithContactMock = mock(async () => null);
const buildRoleAwareConversationHistoryMock = mock(
	(async (): Promise<MockHistoryMessage[]> => []) as (
		...args: unknown[]
	) => Promise<MockHistoryMessage[]>
);

const whereMock = mock(async () => []);
const fromMock = mock((_table: unknown) => ({ where: whereMock }));
const selectMock = mock((_fields: unknown) => ({ from: fromMock }));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getMessageMetadata: getMessageMetadataMock,
	getPublicAiMessagesAfterCursor: getPublicAiMessagesAfterCursorMock,
}));

mock.module("@api/db/queries/visitor", () => ({
	getCompleteVisitorWithContact: getCompleteVisitorWithContactMock,
}));

mock.module("./history", () => ({
	buildRoleAwareConversationHistory: buildRoleAwareConversationHistoryMock,
}));

const modulePromise = import("./load-context");

describe("loadIntakeContext continuation context", () => {
	beforeEach(() => {
		getConversationByIdMock.mockReset();
		getMessageMetadataMock.mockReset();
		getPublicAiMessagesAfterCursorMock.mockReset();
		getCompleteVisitorWithContactMock.mockReset();
		buildRoleAwareConversationHistoryMock.mockReset();
		selectMock.mockReset();
		fromMock.mockReset();
		whereMock.mockReset();

		getCompleteVisitorWithContactMock.mockResolvedValue(null);
		buildRoleAwareConversationHistoryMock.mockResolvedValue([
			{
				messageId: "msg-1",
				content: "Initial question",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-04T10:00:00.000Z",
				visibility: "public",
			},
			{
				messageId: "msg-2",
				content: "Following up",
				senderType: "visitor",
				senderId: "visitor-1",
				senderName: null,
				timestamp: "2026-03-04T10:00:01.000Z",
				visibility: "public",
			},
		]);
		getPublicAiMessagesAfterCursorMock.mockResolvedValue([
			{
				id: "ai-msg-1",
				text: "Here is the answer to your first question.",
				createdAt: "2026-03-04T10:00:02.000Z",
			},
		]);
		whereMock.mockResolvedValue([]);
		fromMock.mockImplementation((_table: unknown) => ({ where: whereMock }));
		selectMock.mockImplementation((_fields: unknown) => ({ from: fromMock }));
	});

	it("loads the previous AI reply after the last processed inbound cursor even when it was created after the trigger timestamp", async () => {
		const { loadIntakeContext } = await modulePromise;

		const result = await loadIntakeContext(
			{
				select: selectMock,
			} as never,
			{
				conversationId: "conv-1",
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-1",
				conversation: {
					id: "conv-1",
					organizationId: "org-1",
					websiteId: "site-1",
					visitorId: "visitor-1",
					aiAgentLastProcessedMessageId: "msg-1",
					aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
					escalatedAt: null,
					escalationHandledAt: null,
					escalationReason: null,
				} as never,
				triggerMetadata: {
					id: "msg-2",
					createdAt: "2026-03-04T10:00:01.000Z",
					conversationId: "conv-1",
					text: "Following up",
				},
			}
		);

		expect(buildRoleAwareConversationHistoryMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				maxCreatedAt: "2026-03-04T10:00:01.000Z",
				maxId: "msg-2",
			})
		);
		expect(getPublicAiMessagesAfterCursorMock).toHaveBeenCalledWith(
			expect.anything(),
			{
				conversationId: "conv-1",
				organizationId: "org-1",
				afterCreatedAt: "2026-03-04T10:00:00.000Z",
				afterId: "msg-1",
				limit: 10,
			}
		);
		expect(result.continuationContext).toEqual({
			previousProcessedMessageId: "msg-1",
			previousProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
			latestAiReply: "Here is the answer to your first question.",
		});
		expect(result.triggerMessage?.messageId).toBe("msg-2");
		expect(result.triggerMessageText).toBe("Following up");
	});
});
