import { beforeEach, describe, expect, it, mock } from "bun:test";

const realtimeEmitMock = mock(async () => {});
const createTimelineItemMock = mock(async () => {});
const createConversationEventMock = mock(async () => {});

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

const modulePromise = Promise.all([
	import("./update-title"),
	import("./update-priority"),
	import("./update-sentiment"),
]);

function createDbMock() {
	const executeWhereMock = mock(async () => []);
	const returningMock = mock(async () => []);
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
		executeWhereMock,
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

		realtimeEmitMock.mockResolvedValue(undefined);
		createTimelineItemMock.mockResolvedValue(undefined);
		createConversationEventMock.mockResolvedValue(undefined);
	});

	it("does not rewrite the title when the normalized title is unchanged", async () => {
		const [{ updateTitle }] = await modulePromise;
		const { db, updateMock } = createDbMock();

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

		expect(updateMock).not.toHaveBeenCalled();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(realtimeEmitMock).not.toHaveBeenCalled();
	});

	it("does not rewrite the priority when it already matches", async () => {
		const [, { updatePriority }] = await modulePromise;
		const { db, updateMock } = createDbMock();

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
});
