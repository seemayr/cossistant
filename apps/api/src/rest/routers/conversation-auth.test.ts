import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const safelyExtractRequestQueryMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);

const getVisitorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationByIdWithLastMessageMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const listConversationsMock = mock((async () => ({
	conversations: [],
	pagination: {
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
		hasMore: false,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const getConversationTimelineItemsMock = mock((async () => ({
	items: [],
	nextCursor: null,
	hasNextPage: false,
})) as (...args: unknown[]) => Promise<unknown>);
const buildConversationExportMock = mock((async () => ({
	filename: "conversation-conv-1.txt",
	content: "Conversation Export\nConversation ID: conv-1",
	mimeType: "text/plain; charset=utf-8",
})) as (...args: unknown[]) => Promise<unknown>);
const getConversationSeenDataMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);
const listConversationsHeadersMock = mock((async () => ({
	items: [],
	nextCursor: null,
})) as (...args: unknown[]) => Promise<unknown>);
const mergeConversationMetadataMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	safelyExtractRequestQuery: safelyExtractRequestQueryMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries", () => ({
	getVisitor: getVisitorMock,
	upsertVisitor: mock(async () => null),
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getConversationByIdWithLastMessage: getConversationByIdWithLastMessageMock,
	getConversationHeader: mock(async () => null),
	getConversationSeenData: getConversationSeenDataMock,
	getConversationTimelineItems: getConversationTimelineItemsMock,
	listConversations: listConversationsMock,
	listConversationsHeaders: listConversationsHeadersMock,
	upsertConversation: mock(async () => ({
		status: "existing",
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
			channel: "widget",
			metadata: null,
			status: "open",
			createdAt: "2026-04-07T10:00:00.000Z",
			updatedAt: "2026-04-07T10:00:00.000Z",
			deletedAt: null,
		},
	})),
}));

mock.module("@api/db/mutations/conversation", () => ({
	archiveConversation: mock(async () => null),
	joinEscalation: mock(async () => null),
	markConversationAsNotSpam: mock(async () => null),
	markConversationAsRead: mock(async () => ({
		conversation: null,
		lastSeenAt: null,
	})),
	mergeConversationMetadata: mergeConversationMetadataMock,
	markConversationAsSeenByVisitor: mock(async () => ({
		conversationId: "conv-1",
		lastSeenAt: "2026-04-07T12:00:00.000Z",
	})),
	markConversationAsSpam: mock(async () => null),
	markConversationAsUnread: mock(async () => null),
	reopenConversation: mock(async () => null),
	resolveConversation: mock(async () => null),
	unarchiveConversation: mock(async () => null),
	updateConversationTitle: mock(async () => null),
}));

mock.module("@api/utils/participant-helpers", () => ({
	addConversationParticipant: mock(async () => null),
	addConversationParticipants: mock(async () => []),
	getDefaultParticipants: mock(async () => []),
	isUserParticipant: mock(() => false),
}));

mock.module("@api/utils/timeline-item", () => ({
	createMessageTimelineItem: mock(async () => ({
		item: {
			id: "msg-1",
			type: "message",
			conversationId: "conv-1",
			organizationId: "org-1",
			visibility: "public",
			text: "hello",
			parts: [],
			userId: null,
			aiAgentId: null,
			visitorId: "visitor-1",
			createdAt: "2026-04-07T10:00:00.000Z",
			deletedAt: null,
			tool: null,
		},
		actor: { type: "visitor", visitorId: "visitor-1" },
	})),
	createTimelineItem: mock(async () => null),
	resolveMessageTimelineActor: mock(() => null),
}));

mock.module("@api/utils/send-message-with-notification", () => ({
	triggerMessageNotificationWorkflow: mock(async () => {}),
}));

mock.module("@api/utils/conversation-realtime", () => ({
	emitConversationCreatedEvent: mock(async () => {}),
	emitConversationSeenEvent: mock(async () => {}),
	emitConversationTypingEvent: mock(async () => {}),
}));

mock.module("@api/ai-pipeline/shared/safety/kill-switch", () => ({
	pauseAiForConversation: mock(async () => null),
	resumeAiForConversation: mock(async () => null),
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: mock(async () => {}),
	},
}));

mock.module("@api/utils/conversation-export", () => ({
	buildConversationExport: buildConversationExportMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: mock(async () => ({})),
}));

mock.module("@api/lib/hard-limits/dashboard", () => ({
	applyDashboardConversationHardLimit: mock(
		({ conversation }: { conversation: unknown }) => conversation
	),
	getDashboardConversationLockCutoff: mock(async () => null),
	resolveDashboardHardLimitPolicy: mock(() => ({})),
}));

mock.module("@api/services/presence", () => ({
	markVisitorPresence: mock(async () => {}),
}));

mock.module("@api/utils/geo-helpers", () => ({
	extractGeoFromVisitor: mock(() => ({})),
}));

mock.module("./feedback-shared", () => ({
	persistFeedbackSubmission: mock(async () => ({
		ratedAt: "2026-04-07T12:00:00.000Z",
	})),
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
}));

const conversationRouterModulePromise = import("./conversation");

const visitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const otherVisitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const conversationId = "conv-1";

function createConversationRecord(
	overrides: Partial<Record<string, unknown>> = {}
) {
	return {
		id: conversationId,
		title: null,
		metadata: null,
		createdAt: "2026-04-07T10:00:00.000Z",
		updatedAt: "2026-04-07T10:00:00.000Z",
		visitorId,
		websiteId: "site-1",
		channel: "widget",
		status: "open",
		visitorRating: null,
		visitorRatingAt: null,
		deletedAt: null,
		organizationId: "org-1",
		...overrides,
	};
}

function createInboxItem(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: conversationId,
		status: "open",
		priority: "normal",
		organizationId: "org-1",
		visitorId,
		visitor: {
			id: visitorId,
			lastSeenAt: null,
			blockedAt: null,
			blockedByUserId: null,
			isBlocked: false,
			contact: null,
		},
		websiteId: "site-1",
		metadata: null,
		channel: "widget",
		title: null,
		titleSource: null,
		sentiment: null,
		sentimentConfidence: null,
		resolutionTime: null,
		visitorRating: null,
		visitorRatingAt: null,
		startedAt: null,
		firstResponseAt: null,
		resolvedAt: null,
		resolvedByUserId: null,
		resolvedByAiAgentId: null,
		escalatedAt: null,
		escalatedByAiAgentId: null,
		escalationReason: null,
		escalationHandledAt: null,
		escalationHandledByUserId: null,
		aiPausedUntil: null,
		createdAt: "2026-04-07T10:00:00.000Z",
		updatedAt: "2026-04-07T11:00:00.000Z",
		deletedAt: null,
		lastMessageAt: "2026-04-07T11:00:00.000Z",
		lastSeenAt: null,
		lastMessageTimelineItem: null,
		lastTimelineItem: null,
		activeClarification: null,
		viewIds: [],
		seenData: [],
		...overrides,
	};
}

describe("conversation auth and inbox routes", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		safelyExtractRequestQueryMock.mockReset();
		validateResponseMock.mockReset();
		getVisitorMock.mockReset();
		getConversationByIdWithLastMessageMock.mockReset();
		getConversationByIdMock.mockReset();
		listConversationsMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		buildConversationExportMock.mockReset();
		getConversationSeenDataMock.mockReset();
		listConversationsHeadersMock.mockReset();
		mergeConversationMetadataMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		getVisitorMock.mockResolvedValue({
			id: visitorId,
			websiteId: "site-1",
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord()
		);
		getConversationByIdMock.mockResolvedValue(createConversationRecord());
		listConversationsMock.mockResolvedValue({
			conversations: [createConversationRecord()],
			pagination: {
				page: 1,
				limit: 10,
				total: 1,
				totalPages: 1,
				hasMore: false,
			},
		});
		getConversationTimelineItemsMock.mockResolvedValue({
			items: [],
			nextCursor: null,
			hasNextPage: false,
		});
		buildConversationExportMock.mockResolvedValue({
			filename: "conversation-conv-1.txt",
			content: "Conversation Export\nConversation ID: conv-1",
			mimeType: "text/plain; charset=utf-8",
		});
		getConversationSeenDataMock.mockResolvedValue([]);
		listConversationsHeadersMock.mockResolvedValue({
			items: [createInboxItem()],
			nextCursor: "cursor_2",
		});
		mergeConversationMetadataMock.mockResolvedValue(createConversationRecord());
	});

	it("lists inbox conversations for private API keys", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				limit: 20,
				cursor: null,
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/inbox?limit=20", {
				method: "GET",
			})
		);

		const payload = (await response.json()) as {
			items: Array<{ id: string }>;
			nextCursor: string | null;
		};

		expect(response.status).toBe(200);
		expect(payload.nextCursor).toBe("cursor_2");
		expect(payload.items[0]?.id).toBe(conversationId);
		expect(listConversationsHeadersMock).toHaveBeenCalledWith(
			{},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				userId: null,
				limit: 20,
				cursor: null,
			}
		);
	});

	it("includes conversation metadata in private inbox responses", async () => {
		listConversationsHeadersMock.mockResolvedValue({
			items: [
				createInboxItem({
					metadata: {
						orderId: "ord_123",
						priority: "vip",
						mrr: 299,
					},
				}),
			],
			nextCursor: null,
		});
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			query: {
				limit: 20,
				cursor: null,
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/inbox?limit=20", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			items: Array<{ metadata?: Record<string, unknown> | null }>;
		};

		expect(response.status).toBe(200);
		expect(payload.items[0]?.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
		});
	});

	it("allows private API keys to read a conversation without a visitor header", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: null,
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
	});

	it("includes public metadata in visitor conversation listings", async () => {
		listConversationsMock.mockResolvedValue({
			conversations: [
				createConversationRecord({
					metadata: {
						orderId: "ord_123",
						priority: "vip",
						mrr: 299,
					},
				}),
			],
			pagination: {
				page: 1,
				limit: 10,
				total: 1,
				totalPages: 1,
				hasMore: false,
			},
		});
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
			query: {
				visitorId,
				page: 1,
				limit: 10,
				status: undefined,
				orderBy: "updatedAt",
				order: "desc",
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/?visitorId=01ARZ3NDEKTSV4RRFFQ69G5FAV", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			conversations: Array<{ metadata?: Record<string, unknown> | null }>;
		};

		expect(response.status).toBe(200);
		expect(payload.conversations[0]?.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
		});
	});

	it("returns public metadata on visitor-owned conversation reads", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord({
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
			})
		);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1", {
				method: "GET",
			})
		);
		const payload = (await response.json()) as {
			conversation: { metadata?: Record<string, unknown> | null };
		};

		expect(response.status).toBe(200);
		expect(payload.conversation.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
		});
	});

	it("returns 404 when a public API key reads another visitor's conversation", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord({ visitorId: otherVisitorId })
		);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1", {
				method: "GET",
			})
		);

		expect(response.status).toBe(404);
	});

	it("returns 404 for timeline reads when a public API key does not own the conversation", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1" },
			visitorIdHeader: visitorId,
			query: {
				limit: 50,
				cursor: null,
			},
		});
		getConversationByIdWithLastMessageMock.mockResolvedValue(
			createConversationRecord({ visitorId: otherVisitorId })
		);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/timeline", {
				method: "GET",
			})
		);

		expect(response.status).toBe(404);
		expect(getConversationTimelineItemsMock).toHaveBeenCalledTimes(0);
	});

	it("returns a plain-text attachment for private export requests", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				slug: "acme",
				teamId: "team-1",
			},
			query: {},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/export", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		);
		expect(response.headers.get("Content-Disposition")).toBe(
			'attachment; filename="conversation-conv-1.txt"'
		);
		expect(await response.text()).toContain("Conversation Export");
		expect(buildConversationExportMock).toHaveBeenCalledTimes(1);
	});

	it("merges conversation metadata through the private patch route", async () => {
		const updatedConversation = createConversationRecord({
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				teamId: "team-1",
			},
			body: {
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
			},
		});
		mergeConversationMetadataMock.mockResolvedValue(updatedConversation);

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/metadata", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					metadata: {
						orderId: "ord_123",
						priority: "vip",
						mrr: 299,
					},
				}),
			})
		);
		const payload = (await response.json()) as {
			conversation: { metadata?: Record<string, unknown> | null };
		};

		expect(response.status).toBe(200);
		expect(mergeConversationMetadataMock).toHaveBeenCalledWith(
			{},
			{
				conversation: createConversationRecord(),
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
			}
		);
		expect(payload.conversation.metadata).toEqual({
			orderId: "ord_123",
			priority: "vip",
			mrr: 299,
		});
	});

	it("rejects public API keys for full export requests", async () => {
		safelyExtractRequestQueryMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				slug: "acme",
				teamId: "team-1",
			},
			visitorIdHeader: visitorId,
			query: {},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/export", {
				method: "GET",
			})
		);

		expect(response.status).toBe(403);
		expect(buildConversationExportMock).toHaveBeenCalledTimes(0);
	});

	it("rejects public API keys for private metadata updates", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
				teamId: "team-1",
			},
			body: {
				metadata: {
					orderId: "ord_123",
				},
			},
		});

		const { conversationRouter } = await conversationRouterModulePromise;
		const response = await conversationRouter.request(
			new Request("http://localhost/conv-1/metadata", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					metadata: {
						orderId: "ord_123",
					},
				}),
			})
		);

		expect(response.status).toBe(403);
		expect(mergeConversationMetadataMock).toHaveBeenCalledTimes(0);
	});
});
