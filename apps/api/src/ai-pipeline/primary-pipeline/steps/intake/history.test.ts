import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
	isConversationMessage,
	isConversationToolAction,
} from "../../contracts";

type MockTimelineItem =
	| ReturnType<typeof createMessage>
	| ReturnType<typeof createTool>;

type MockTimelinePage = {
	items: MockTimelineItem[];
	hasNextPage: boolean;
	nextCursor?: string;
};

const getConversationTimelineItemsMock = mock(
	async (): Promise<MockTimelinePage> => ({
		items: [],
		hasNextPage: false,
		nextCursor: undefined,
	})
);
const getConversationTimelineItemsAfterCursorMock = mock(
	async (): Promise<MockTimelineItem[]> => []
);

mock.module("@api/db/queries/conversation", () => ({
	getConversationTimelineItems: getConversationTimelineItemsMock,
	getConversationTimelineItemsAfterCursor:
		getConversationTimelineItemsAfterCursorMock,
}));

const modulePromise = import("./history");

function createMessage(
	id: number,
	params: {
		senderType?: "visitor" | "human_agent" | "ai_agent";
		visibility?: "public" | "private";
		text?: string;
	} = {}
) {
	const senderType = params.senderType ?? "visitor";

	return {
		id: `msg-${id}`,
		conversationId: "conv-1",
		organizationId: "org-1",
		type: "message",
		text: params.text ?? `Message ${id}`,
		parts: [{ type: "text", text: params.text ?? `Message ${id}` }],
		userId: senderType === "human_agent" ? "user-1" : null,
		visitorId: senderType === "visitor" ? "visitor-1" : null,
		aiAgentId: senderType === "ai_agent" ? "ai-1" : null,
		visibility: params.visibility ?? "public",
		createdAt: `2026-03-08T10:${String(id).padStart(2, "0")}:00.000Z`,
		deletedAt: null,
	};
}

function createTool(params: {
	id: string;
	toolName: string;
	createdAt: string;
	query?: string;
	totalFound?: number;
	text?: string;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
}) {
	return {
		id: params.id,
		conversationId: "conv-1",
		organizationId: "org-1",
		type: "tool",
		text:
			params.text ??
			(params.toolName === "searchKnowledgeBase"
				? `Found ${params.totalFound ?? 0} relevant sources`
				: `Completed ${params.toolName}`),
		parts: [
			{
				type: `tool-${params.toolName}`,
				toolCallId: `${params.id}-call`,
				toolName: params.toolName,
				state: "result",
				input: params.input ?? (params.query ? { query: params.query } : {}),
				output:
					params.output ??
					(params.toolName === "searchKnowledgeBase"
						? {
								data: {
									totalFound: params.totalFound ?? 0,
									articles: [],
								},
							}
						: {}),
			},
		],
		userId: null,
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		visibility: "private",
		createdAt: params.createdAt,
		deletedAt: null,
	};
}

describe("buildConversationTranscript", () => {
	beforeEach(() => {
		getConversationTimelineItemsMock.mockReset();
		getConversationTimelineItemsAfterCursorMock.mockReset();
	});

	it("collects 50 real messages and keeps relevant interleaved tool actions", async () => {
		const firstPageMessages = Array.from({ length: 30 }, (_, index) =>
			createMessage(index + 26)
		);
		firstPageMessages.splice(
			24,
			0,
			createTool({
				id: "tool-search-1",
				toolName: "searchKnowledgeBase",
				query: "refund policy",
				totalFound: 3,
				createdAt: "2026-03-08T10:53:30.000Z",
			}) as never
		);
		firstPageMessages.push(
			createTool({
				id: "tool-credits-1",
				toolName: "aiCreditUsage",
				createdAt: "2026-03-08T10:55:30.000Z",
			}) as never
		);

		const secondPageMessages = Array.from({ length: 25 }, (_, index) =>
			createMessage(index + 1)
		);

		getConversationTimelineItemsMock
			.mockResolvedValueOnce({
				items: firstPageMessages,
				hasNextPage: true,
				nextCursor: "cursor-1",
			})
			.mockResolvedValueOnce({
				items: secondPageMessages,
				hasNextPage: false,
				nextCursor: undefined,
			});

		const { buildConversationTranscript } = await modulePromise;
		const transcript = await buildConversationTranscript({} as never, {
			conversationId: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			maxCreatedAt: "2026-03-08T10:55:59.000Z",
			maxId: "msg-55",
		});

		const messageEntries = transcript.filter(isConversationMessage);
		const toolEntries = transcript.filter(isConversationToolAction);

		expect(getConversationTimelineItemsMock).toHaveBeenCalledTimes(2);
		expect(messageEntries).toHaveLength(50);
		expect(messageEntries[0]?.messageId).toBe("msg-6");
		expect(messageEntries.at(-1)?.messageId).toBe("msg-55");
		expect(toolEntries).toHaveLength(1);
		expect(toolEntries[0]?.content).toContain(
			"[PRIVATE][TOOL:searchKnowledgeBase]"
		);
		expect(toolEntries[0]?.content).toContain('query="refund policy"');
		expect(toolEntries[0]?.content).toContain("results=3");
	});

	it("does not append metadata detail for unchanged background tool results", async () => {
		getConversationTimelineItemsMock.mockResolvedValueOnce({
			items: [
				createMessage(1, {
					senderType: "visitor",
					text: "Can you help with billing?",
				}),
				createTool({
					id: "tool-title-unchanged",
					toolName: "updateConversationTitle",
					createdAt: "2026-03-08T10:01:00.000Z",
					text: "Conversation title unchanged",
					input: { title: "Help with billing" },
					output: {
						data: {
							changed: false,
							reason: "unchanged",
							title: "Help with billing",
						},
					},
				}) as never,
				createTool({
					id: "tool-sentiment-unchanged",
					toolName: "updateSentiment",
					createdAt: "2026-03-08T10:02:00.000Z",
					text: "Sentiment unchanged",
					input: { sentiment: "positive" },
					output: {
						data: {
							changed: false,
							reason: "unchanged",
							sentiment: "positive",
						},
					},
				}) as never,
				createTool({
					id: "tool-priority-unchanged",
					toolName: "setPriority",
					createdAt: "2026-03-08T10:03:00.000Z",
					text: "Priority unchanged",
					input: { priority: "high" },
					output: {
						data: {
							changed: false,
							reason: "unchanged",
							priority: "high",
						},
					},
				}) as never,
			],
			hasNextPage: false,
			nextCursor: undefined,
		});

		const { buildConversationTranscript } = await modulePromise;
		const transcript = await buildConversationTranscript({} as never, {
			conversationId: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
		});

		const toolEntries = transcript.filter(isConversationToolAction);

		expect(toolEntries).toHaveLength(3);
		expect(toolEntries[0]?.content).toContain("Conversation title unchanged");
		expect(toolEntries[0]?.content).not.toContain('title="Help with billing"');
		expect(toolEntries[1]?.content).toContain("Sentiment unchanged");
		expect(toolEntries[1]?.content).not.toContain("sentiment=positive");
		expect(toolEntries[2]?.content).toContain("Priority unchanged");
		expect(toolEntries[2]?.content).not.toContain("priority=high");
	});
});

describe("buildTriggerCenteredTimelineContext", () => {
	beforeEach(() => {
		getConversationTimelineItemsMock.mockReset();
		getConversationTimelineItemsAfterCursorMock.mockReset();
	});

	it("keeps FIFO trigger focus while exposing later teammate and tool context", async () => {
		getConversationTimelineItemsMock.mockResolvedValueOnce({
			items: [
				createMessage(1, {
					senderType: "visitor",
					text: "My seat limit seems wrong.",
				}),
				createMessage(2, {
					senderType: "visitor",
					text: "Can you confirm how extra seats are billed?",
				}),
			],
			hasNextPage: false,
			nextCursor: undefined,
		});
		getConversationTimelineItemsAfterCursorMock.mockResolvedValueOnce([
			createMessage(3, {
				senderType: "human_agent",
				text: "Each extra seat is billed at $10/mo.",
			}),
			createTool({
				id: "tool-search-2",
				toolName: "searchKnowledgeBase",
				query: "extra seat billing",
				totalFound: 2,
				createdAt: "2026-03-08T10:03:30.000Z",
			}) as never,
			createMessage(4, {
				senderType: "ai_agent",
				visibility: "private",
				text: "Internal note: teammate already answered publicly.",
			}),
		]);

		const { buildTriggerCenteredTimelineContext } = await modulePromise;
		const context = await buildTriggerCenteredTimelineContext({} as never, {
			conversationId: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			triggerMessageId: "msg-2",
			triggerMessageCreatedAt: "2026-03-08T10:02:00.000Z",
		});

		expect(getConversationTimelineItemsMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				maxCreatedAt: "2026-03-08T10:02:00.000Z",
				maxId: "msg-2",
			})
		);
		expect(getConversationTimelineItemsAfterCursorMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				afterCreatedAt: "2026-03-08T10:02:00.000Z",
				afterId: "msg-2",
			})
		);
		expect(context.triggerMessage).toMatchObject({
			messageId: "msg-2",
			segment: "trigger",
		});
		expect(context.decisionMessages.map((entry) => entry.segment)).toEqual([
			"before_trigger",
			"trigger",
			"after_trigger",
			"after_trigger",
		]);
		expect(context.hasLaterHumanMessage).toBe(true);
		expect(context.hasLaterAiMessage).toBe(true);
		expect(context.generationEntries).toHaveLength(5);
		expect(
			context.generationEntries.find(
				(entry) =>
					isConversationToolAction(entry) &&
					entry.segment === "after_trigger" &&
					entry.toolName === "searchKnowledgeBase"
			)
		).toBeDefined();
		expect(
			context.conversationHistory.every((entry) => !("segment" in entry))
		).toBe(true);
	});
});
