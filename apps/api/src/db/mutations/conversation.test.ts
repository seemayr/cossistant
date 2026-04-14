import { describe, expect, it, mock } from "bun:test";
import type { ConversationRecord } from "./conversation";

const conversationMutationsModulePromise = import("./conversation");

type ConversationRow = ConversationRecord;

function buildConversationRow(
	overrides: Partial<ConversationRow> = {}
): ConversationRow {
	return {
		id: "conv-1",
		status: "open",
		priority: "normal",
		organizationId: "org-1",
		visitorId: "visitor-1",
		websiteId: "site-1",
		sentiment: null,
		sentimentConfidence: null,
		channel: "widget",
		title: null,
		visitorTitle: null,
		visitorTitleLanguage: null,
		visitorLanguage: null,
		metadata: null,
		titleSource: null,
		translationActivatedAt: null,
		translationChargedAt: null,
		resolutionTime: null,
		visitorRating: null,
		visitorRatingAt: null,
		startedAt: null,
		firstResponseAt: null,
		resolvedAt: null,
		lastMessageAt: null,
		lastMessageBy: null,
		resolvedByUserId: null,
		resolvedByAiAgentId: null,
		escalatedAt: null,
		escalatedByAiAgentId: null,
		escalationReason: null,
		escalationHandledAt: null,
		escalationHandledByUserId: null,
		aiPausedUntil: null,
		aiAgentLastProcessedMessageId: null,
		aiAgentLastProcessedMessageCreatedAt: null,
		createdAt: "2026-04-10T00:00:00.000Z",
		updatedAt: "2026-04-10T00:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

function createDbHarness(updatedRow: ConversationRow | null) {
	const returningMock = mock(async () =>
		updatedRow ? ([updatedRow] as unknown as Record<string, unknown>[]) : []
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
		setMock,
	};
}

describe("mergeConversationMetadata", () => {
	it("merges metadata into an empty conversation metadata object", async () => {
		const updated = buildConversationRow({
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});
		const harness = createDbHarness(updated);
		const { mergeConversationMetadata } =
			await conversationMutationsModulePromise;

		const result = await mergeConversationMetadata(harness.db as never, {
			conversation: buildConversationRow(),
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});

		expect(harness.setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					mrr: 299,
				},
				updatedAt: expect.any(String),
			})
		);
		expect(result).toEqual(updated);
	});

	it("preserves existing keys while overwriting provided keys", async () => {
		const updated = buildConversationRow({
			metadata: {
				orderId: "ord_123",
				priority: "vip",
				segment: "enterprise",
				flagged: null,
			},
		});
		const harness = createDbHarness(updated);
		const { mergeConversationMetadata } =
			await conversationMutationsModulePromise;

		await mergeConversationMetadata(harness.db as never, {
			conversation: buildConversationRow({
				metadata: {
					orderId: "ord_123",
					priority: "standard",
					segment: "enterprise",
				},
			}),
			metadata: {
				priority: "vip",
				flagged: null,
			},
		});

		expect(harness.setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: {
					orderId: "ord_123",
					priority: "vip",
					segment: "enterprise",
					flagged: null,
				},
				updatedAt: expect.any(String),
			})
		);
	});
});
