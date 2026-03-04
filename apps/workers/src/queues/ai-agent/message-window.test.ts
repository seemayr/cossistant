import { beforeEach, describe, expect, it, mock } from "bun:test";

const getMessageMetadataMock = mock(
	async (): Promise<{
		id: string;
		createdAt: string;
		conversationId: string;
		userId: string | null;
		visitorId: string | null;
	} | null> => null
);
const getConversationMessagesAfterCursorMock = mock(
	async (): Promise<Array<{ id: string; createdAt: string }>> => []
);

mock.module("@api/db/queries/conversation", () => ({
	getMessageMetadata: getMessageMetadataMock,
	getConversationMessagesAfterCursor: getConversationMessagesAfterCursorMock,
}));

const modulePromise = import("./message-window");

describe("message-window triggerable filtering", () => {
	beforeEach(() => {
		getMessageMetadataMock.mockReset();
		getConversationMessagesAfterCursorMock.mockReset();

		getMessageMetadataMock.mockResolvedValue(null);
		getConversationMessagesAfterCursorMock.mockResolvedValue([]);
	});

	it("ignores AI-authored cursor message and keeps triggerable trailing messages", async () => {
		getMessageMetadataMock.mockResolvedValue({
			id: "msg-ai",
			createdAt: "2026-03-04T10:00:00.000Z",
			conversationId: "conv-1",
			userId: null,
			visitorId: null,
		});
		getConversationMessagesAfterCursorMock.mockResolvedValue([
			{ id: "msg-team", createdAt: "2026-03-04T10:00:01.000Z" },
			{ id: "msg-visitor", createdAt: "2026-03-04T10:00:02.000Z" },
		]);

		const { buildMessageWindowFromCursor } = await modulePromise;
		const result = await buildMessageWindowFromCursor({
			db: {} as never,
			organizationId: "org-1",
			conversationId: "conv-1",
			cursor: {
				messageId: "msg-ai",
				messageCreatedAt: "2026-03-04T10:00:00.000Z",
			},
		});

		expect(result).toEqual([
			{ id: "msg-team", createdAt: "2026-03-04T10:00:01.000Z" },
			{ id: "msg-visitor", createdAt: "2026-03-04T10:00:02.000Z" },
		]);
	});
});
