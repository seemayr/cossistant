import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
	ConversationEventType,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";

const getAiAgentForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getConversationTimelineItemsMock = mock((async () => ({
	items: [],
	nextCursor: undefined,
	hasNextPage: false,
})) as (...args: unknown[]) => Promise<unknown>);
const getWebsiteMembersMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);
const getCompleteVisitorWithContactMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/db/queries/ai-agent", () => ({
	getAiAgentForWebsite: getAiAgentForWebsiteMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationTimelineItems: getConversationTimelineItemsMock,
	getConversationByIdWithLastMessage: mock(async () => null),
	getConversationHeader: mock(async () => null),
	getConversationSeenData: mock(async () => []),
	listConversations: mock(async () => ({
		conversations: [],
		pagination: {
			page: 1,
			limit: 10,
			total: 0,
			totalPages: 0,
			hasMore: false,
		},
	})),
	listConversationsHeaders: mock(async () => ({
		items: [],
		nextCursor: null,
	})),
	upsertConversation: mock(async () => null),
}));

mock.module("@api/db/queries/member", () => ({
	getWebsiteMembers: getWebsiteMembersMock,
}));

mock.module("@api/db/queries/visitor", () => ({
	getCompleteVisitorWithContact: getCompleteVisitorWithContactMock,
}));

const modulePromise = import("./conversation-export");

function createTimelineItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	const baseItem: TimelineItem = {
		id: "item-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: TimelineItemVisibility.PUBLIC,
		type: ConversationTimelineType.MESSAGE,
		text: null,
		parts: [],
		userId: null,
		aiAgentId: null,
		visitorId: null,
		createdAt: "2026-04-07T10:00:00.000Z",
		deletedAt: null,
		tool: null,
	};

	return {
		...baseItem,
		...overrides,
	};
}

describe("buildConversationExport", () => {
	beforeEach(() => {
		getAiAgentForWebsiteMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		getWebsiteMembersMock.mockReset();
		getCompleteVisitorWithContactMock.mockReset();

		getAiAgentForWebsiteMock.mockResolvedValue({
			id: "ai-1",
			name: "Support Bot",
		});
		getWebsiteMembersMock.mockResolvedValue([
			{
				id: "user-1",
				name: "Alice",
			},
		]);
		getCompleteVisitorWithContactMock.mockResolvedValue({
			id: "visitor-1",
			contact: {
				name: "Jane Doe",
				email: "jane@example.com",
			},
		});
	});

	it("formats full internal transcripts in chronological order and omits tool items", async () => {
		getConversationTimelineItemsMock
			.mockResolvedValueOnce({
				items: [
					createTimelineItem({
						id: "msg-team",
						createdAt: "2026-04-07T10:02:00.000Z",
						type: ConversationTimelineType.MESSAGE,
						visibility: TimelineItemVisibility.PRIVATE,
						text: "Customer likely on the legacy billing plan.",
						parts: [
							{
								type: "text",
								text: "Customer likely on the legacy billing plan.",
							},
							{
								type: "file",
								url: "https://example.com/invoice.pdf",
								filename: "invoice.pdf",
								mediaType: "application/pdf",
							},
						],
						userId: "user-1",
					}),
					createTimelineItem({
						id: "tool-hidden",
						createdAt: "2026-04-07T10:03:00.000Z",
						type: ConversationTimelineType.TOOL,
						text: "Should not appear",
						parts: [],
						aiAgentId: "ai-1",
					}),
					createTimelineItem({
						id: "msg-ai",
						createdAt: "2026-04-07T10:04:00.000Z",
						type: ConversationTimelineType.MESSAGE,
						text: "I can help with that billing issue.",
						parts: [
							{
								type: "text",
								text: "I can help with that billing issue.",
							},
						],
						aiAgentId: "ai-1",
					}),
				],
				nextCursor: "cursor-2",
				hasNextPage: true,
			})
			.mockResolvedValueOnce({
				items: [
					createTimelineItem({
						id: "msg-visitor",
						createdAt: "2026-04-07T10:00:00.000Z",
						type: ConversationTimelineType.MESSAGE,
						text: "Need help with billing.",
						parts: [
							{
								type: "text",
								text: "Need help with billing.",
							},
						],
						visitorId: "visitor-1",
					}),
					createTimelineItem({
						id: "event-1",
						createdAt: "2026-04-07T10:01:00.000Z",
						type: ConversationTimelineType.EVENT,
						text: null,
						visibility: TimelineItemVisibility.PRIVATE,
						parts: [
							{
								type: "event",
								eventType: ConversationEventType.PARTICIPANT_JOINED,
								actorUserId: "user-1",
								actorAiAgentId: null,
								targetUserId: null,
								targetAiAgentId: null,
								message: null,
							},
						],
						userId: "user-1",
					}),
				],
				nextCursor: undefined,
				hasNextPage: false,
			});

		const { buildConversationExport } = await modulePromise;
		const result = await buildConversationExport({
			db: {} as never,
			website: {
				id: "site-1",
				slug: "acme",
				organizationId: "org-1",
				teamId: "team-1",
			},
			conversation: {
				id: "conv-1",
				title: "Billing thread",
				createdAt: "2026-04-07T10:00:00.000Z",
				visitorId: "visitor-1",
			},
		});

		expect(result.filename).toBe("conversation-conv-1.txt");
		expect(result.mimeType).toBe("text/plain; charset=utf-8");
		expect(result.content).toContain("Conversation Export");
		expect(result.content).toContain("Website: acme");
		expect(result.content).toContain("Visitor: Jane Doe <jane@example.com>");
		expect(result.content).toContain(
			"[2026-04-07T10:00:00.000Z] Visitor: Jane Doe [public]"
		);
		expect(result.content).toContain("Need help with billing.");
		expect(result.content).toContain(
			"[2026-04-07T10:01:00.000Z] Event [private]"
		);
		expect(result.content).toContain("Alice joined the conversation");
		expect(result.content).toContain(
			"[2026-04-07T10:02:00.000Z] Team: Alice [private]"
		);
		expect(result.content).toContain("Attachments:");
		expect(result.content).toContain(
			"- File invoice.pdf (application/pdf) https://example.com/invoice.pdf"
		);
		expect(result.content).toContain(
			"[2026-04-07T10:04:00.000Z] AI: Support Bot [public]"
		);
		expect(result.content).not.toContain("Should not appear");

		const visitorIndex = result.content.indexOf("Need help with billing.");
		const eventIndex = result.content.indexOf("Alice joined the conversation");
		const teamIndex = result.content.indexOf(
			"Customer likely on the legacy billing plan."
		);
		const aiIndex = result.content.indexOf(
			"I can help with that billing issue."
		);

		expect(visitorIndex).toBeLessThan(eventIndex);
		expect(eventIndex).toBeLessThan(teamIndex);
		expect(teamIndex).toBeLessThan(aiIndex);
	});
});
