import { beforeEach, describe, expect, it, mock } from "bun:test";

const trackConversationMetricForVisitorMock = mock(() => {});

mock.module("@api/lib/tinybird-sdk", () => ({
	trackConversationMetricForVisitor: trackConversationMetricForVisitorMock,
}));

const conversationQueriesModulePromise = import("./conversation");

type ConversationRow = {
	id: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	channel: string;
	metadata: Record<string, string | number | boolean | null> | null;
	status: string;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
};

function buildConversationRow(
	overrides: Partial<ConversationRow> = {}
): ConversationRow {
	return {
		id: "CO4GKT9QZ2BJKXMVR",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		channel: "widget",
		metadata: null,
		status: "open",
		createdAt: "2026-02-26T00:00:00.000Z",
		updatedAt: "2026-02-26T00:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

function createDbHarness(params: {
	insertRows: ConversationRow[];
	selectRows: ConversationRow[];
}) {
	const insertReturningMock = mock(
		async () => params.insertRows as unknown as Record<string, unknown>[]
	);
	const onConflictDoNothingMock = mock(() => ({
		returning: insertReturningMock,
	}));
	const insertValuesMock = mock(() => ({
		onConflictDoNothing: onConflictDoNothingMock,
	}));
	const insertMock = mock(() => ({
		values: insertValuesMock,
	}));

	const selectLimitMock = mock(
		async () => params.selectRows as unknown as Record<string, unknown>[]
	);
	const selectWhereMock = mock(() => ({
		limit: selectLimitMock,
	}));
	const selectFromMock = mock(() => ({
		where: selectWhereMock,
	}));
	const selectMock = mock(() => ({
		from: selectFromMock,
	}));

	return {
		db: {
			insert: insertMock,
			select: selectMock,
		},
		insertMock,
		insertValuesMock,
		selectMock,
	};
}

describe("upsertConversation", () => {
	beforeEach(() => {
		trackConversationMetricForVisitorMock.mockReset();
		trackConversationMetricForVisitorMock.mockImplementation(() => {});
	});

	it("returns created when insert succeeds", async () => {
		const created = buildConversationRow();
		const harness = createDbHarness({
			insertRows: [created],
			selectRows: [],
		});
		const { upsertConversation } = await conversationQueriesModulePromise;

		const result = await upsertConversation(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			conversationId: created.id,
		});

		expect(result.status).toBe("created");
		if (result.status !== "created") {
			throw new Error("Expected created status");
		}
		expect(result.conversation.id).toBe(created.id);
		expect(result.conversation.organizationId).toBe(created.organizationId);
		expect(result.conversation.websiteId).toBe(created.websiteId);
		expect(result.conversation.visitorId).toBe(created.visitorId);
		expect(harness.selectMock).not.toHaveBeenCalled();
		expect(trackConversationMetricForVisitorMock).toHaveBeenCalledTimes(1);
	});

	it("persists public metadata when creating a new conversation", async () => {
		const created = buildConversationRow({
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});
		const harness = createDbHarness({
			insertRows: [created],
			selectRows: [],
		});
		const { upsertConversation } = await conversationQueriesModulePromise;

		await upsertConversation(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			conversationId: created.id,
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});

		expect(harness.insertValuesMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
			})
		);
	});

	it("persists channel when creating a new conversation", async () => {
		const created = buildConversationRow({
			channel: "api",
		});
		const harness = createDbHarness({
			insertRows: [created],
			selectRows: [],
		});
		const { upsertConversation } = await conversationQueriesModulePromise;

		await upsertConversation(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			conversationId: created.id,
			channel: "api",
		});

		expect(harness.insertValuesMock).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "api",
			})
		);
	});

	it("defaults channel to widget when creating a new conversation without one", async () => {
		const created = buildConversationRow({
			channel: "widget",
		});
		const harness = createDbHarness({
			insertRows: [created],
			selectRows: [],
		});
		const { upsertConversation } = await conversationQueriesModulePromise;

		await upsertConversation(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			conversationId: created.id,
		});

		expect(harness.insertValuesMock).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "widget",
			})
		);
	});

	it("returns existing when conversation already exists for same owner tuple", async () => {
		const existing = buildConversationRow();
		const harness = createDbHarness({
			insertRows: [],
			selectRows: [existing],
		});
		const { upsertConversation } = await conversationQueriesModulePromise;

		const result = await upsertConversation(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			conversationId: existing.id,
		});

		expect(result.status).toBe("existing");
		if (result.status !== "existing") {
			throw new Error("Expected existing status");
		}
		expect(result.conversation.id).toBe(existing.id);
		expect(result.conversation.organizationId).toBe(existing.organizationId);
		expect(result.conversation.websiteId).toBe(existing.websiteId);
		expect(result.conversation.visitorId).toBe(existing.visitorId);
		expect(trackConversationMetricForVisitorMock).not.toHaveBeenCalled();
	});

	it("keeps the original channel when returning an existing same-owner conversation", async () => {
		const existing = buildConversationRow({
			channel: "widget",
		});
		const harness = createDbHarness({
			insertRows: [],
			selectRows: [existing],
		});
		const { upsertConversation } = await conversationQueriesModulePromise;

		const result = await upsertConversation(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			conversationId: existing.id,
			channel: "api",
		});

		expect(result.status).toBe("existing");
		if (result.status !== "existing") {
			throw new Error("Expected existing status");
		}
		expect(result.conversation.channel).toBe("widget");
	});

	it("returns ownership_mismatch conflict when existing conversation belongs to another owner tuple", async () => {
		const existing = buildConversationRow({
			visitorId: "visitor-other",
		});
		const harness = createDbHarness({
			insertRows: [],
			selectRows: [existing],
		});
		const { upsertConversation } = await conversationQueriesModulePromise;

		const result = await upsertConversation(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			conversationId: existing.id,
		});

		expect(result).toEqual({
			status: "conflict",
			reason: "ownership_mismatch",
		});
	});

	it("returns conflict_not_resolvable when insert conflicts but existing row cannot be loaded", async () => {
		const harness = createDbHarness({
			insertRows: [],
			selectRows: [],
		});
		const { upsertConversation } = await conversationQueriesModulePromise;

		const result = await upsertConversation(harness.db as never, {
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			conversationId: "CO4GKT9QZ2BJKXMVR",
		});

		expect(result).toEqual({
			status: "conflict",
			reason: "conflict_not_resolvable",
		});
	});
});
