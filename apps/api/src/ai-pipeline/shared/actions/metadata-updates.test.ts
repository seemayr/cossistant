import { beforeEach, describe, expect, it, mock } from "bun:test";

type MockConversationState = {
	id: string;
	visitorId: string;
	title?: string | null;
	titleSource?: string | null;
	priority?: string;
	sentiment?: string | null;
	sentimentConfidence?: number | null;
};

const realtimeEmitMock = mock(async () => {});
const createTimelineItemMock = mock(async () => {});
const createConversationEventMock = mock(async () => {});
const loadCurrentConversationMock = mock(
	(async (): Promise<MockConversationState | null> => null) as (
		...args: unknown[]
	) => Promise<MockConversationState | null>
);

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
}));

mock.module("@api/utils/conversation-event", () => ({
	createConversationEvent: createConversationEventMock,
}));

mock.module("./load-current-conversation", () => ({
	loadCurrentConversation: loadCurrentConversationMock,
}));

const modulePromise = Promise.all([
	import("./update-title"),
	import("./update-priority"),
	import("./update-sentiment"),
]);

function createDbMock() {
	const returningMock = mock(
		(async (): Promise<Array<{ id: string; priority: string }>> => []) as (
			...args: unknown[]
		) => Promise<Array<{ id: string; priority: string }>>
	);
	const whereMock = mock(() => ({
		returning: returningMock,
	}));
	const setMock = mock(() => ({
		where: whereMock,
	}));
	const updateMock = mock(() => ({
		set: setMock,
	}));

	return {
		db: {
			update: updateMock,
		},
		updateMock,
		returningMock,
		whereMock,
		setMock,
	};
}

describe("metadata update actions", () => {
	beforeEach(() => {
		realtimeEmitMock.mockReset();
		createTimelineItemMock.mockReset();
		createConversationEventMock.mockReset();
		loadCurrentConversationMock.mockReset();

		realtimeEmitMock.mockResolvedValue(undefined);
		createTimelineItemMock.mockResolvedValue(undefined);
		createConversationEventMock.mockResolvedValue(undefined);
		loadCurrentConversationMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-1",
			title: null,
			titleSource: null,
			priority: "normal",
			sentiment: null,
			sentimentConfidence: null,
		});
	});

	it("does not rewrite the title when the normalized title is unchanged", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			title: "Billing issue",
			titleSource: null,
		});

		await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: "Billing issue",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "  billing   issue  ",
		});

		expect(loadCurrentConversationMock).toHaveBeenCalledWith(db, "conv-1");
		expect(updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not let AI overwrite a manually owned title", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			title: "Manual title",
			titleSource: "user",
		});

		const result = await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: "Manual title",
				titleSource: "user",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "AI title",
		});

		expect(result).toEqual({
			changed: false,
			reason: "manual_title",
		});
		expect(updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not rewrite the priority when it already matches", async () => {
		const [, { updatePriority }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			priority: "high",
		});

		await updatePriority({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "high",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			newPriority: "high",
		});

		expect(updateMock).not.toHaveBeenCalled();
		expect(createConversationEventMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not rewrite sentiment when the change is within the idempotency threshold", async () => {
		const [, , { updateSentiment }] = await modulePromise;
		const { db, updateMock } = createDbMock();
		loadCurrentConversationMock.mockResolvedValueOnce({
			id: "conv-1",
			visitorId: "visitor-1",
			sentiment: "neutral",
			sentimentConfidence: 0.5,
		});

		await updateSentiment({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: "neutral",
				sentimentConfidence: 0.5,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			sentiment: "neutral",
			confidence: 0.505,
		});

		expect(updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not rewrite the title on a second call when the caller snapshot is stale", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock } = createDbMock();

		loadCurrentConversationMock
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
				titleSource: null,
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				title: "Help with billing",
				titleSource: "ai",
			});

		await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
				titleSource: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "Help with billing",
		});
		const secondResult = await updateTitle({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				title: null,
				titleSource: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			title: "Help with billing",
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(secondResult).toEqual({
			changed: false,
			reason: "unchanged",
		});
	});

	it("does not rewrite the priority on a second call when the caller snapshot is stale", async () => {
		const [, { updatePriority }] = await modulePromise;
		const { db, updateMock, returningMock } = createDbMock();

		loadCurrentConversationMock
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "normal",
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "high",
			});
		returningMock.mockResolvedValueOnce([
			{
				id: "conv-1",
				priority: "high",
			},
		]);

		await updatePriority({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "normal",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			newPriority: "high",
			emitTimelineEvent: false,
		});
		const secondResult = await updatePriority({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				priority: "normal",
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			newPriority: "high",
			emitTimelineEvent: false,
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(secondResult).toEqual({
			changed: false,
			reason: "unchanged",
		});
	});

	it("does not rewrite sentiment on a second call when the caller snapshot is stale", async () => {
		const [, , { updateSentiment }] = await modulePromise;
		const { db, updateMock } = createDbMock();

		loadCurrentConversationMock
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: null,
				sentimentConfidence: null,
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: "positive",
				sentimentConfidence: 0.9,
			});

		await updateSentiment({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: null,
				sentimentConfidence: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			sentiment: "positive",
			confidence: 0.9,
		});
		const secondResult = await updateSentiment({
			db: db as never,
			conversation: {
				id: "conv-1",
				visitorId: "visitor-1",
				sentiment: null,
				sentimentConfidence: null,
			} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: "ai-1",
			sentiment: "positive",
			confidence: 0.9,
		});

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(secondResult).toEqual({
			changed: false,
			reason: "unchanged",
		});
	});
});
