import { describe, expect, it } from "bun:test";
import {
	buildConversationListModel,
	getAdjacentConversationId,
	getScrollTargetForRange,
	resolveFocusedConversationId,
} from "./model";

describe("conversation list model", () => {
	it("tracks ordered conversations and item offsets across smart rows", () => {
		const model = buildConversationListModel({
			conversations: [{ id: "conv-1" }, { id: "conv-2" }],
			items: [
				{ type: "analytics" },
				{ type: "header", category: "needsHuman" },
				{ type: "conversation", conversation: { id: "conv-1" } },
				{ type: "conversation", conversation: { id: "conv-2" } },
			],
			itemHeight: 48,
			headerHeight: 48,
			analyticsHeight: 76,
			gap: 4,
		});

		expect(model.orderedConversationIds).toEqual(["conv-1", "conv-2"]);
		expect(model.conversationIdToItemIndex.get("conv-1")).toBe(2);
		expect(model.conversationIdToOrderIndex.get("conv-2")).toBe(1);
		expect(model.itemStarts).toEqual([0, 80, 132, 184]);
		expect(model.itemEnds).toEqual([76, 128, 180, 232]);
		expect(model.totalSize).toBe(232);
	});

	it("wraps adjacent navigation in visible conversation order", () => {
		const model = buildConversationListModel({
			conversations: [{ id: "conv-1" }, { id: "conv-2" }],
			itemHeight: 48,
			headerHeight: 48,
			analyticsHeight: 76,
			gap: 4,
		});

		expect(getAdjacentConversationId(model, "conv-2", "down", true)).toBe(
			"conv-1"
		);
		expect(getAdjacentConversationId(model, "conv-1", "up", true)).toBe(
			"conv-2"
		);
	});

	it("keeps focus on the same id across reorders and picks the next survivor on removal", () => {
		expect(
			resolveFocusedConversationId({
				previousConversationIds: ["conv-1", "conv-2", "conv-3"],
				nextConversationIds: ["conv-3", "conv-1"],
				focusedConversationId: "conv-1",
			})
		).toBe("conv-1");

		expect(
			resolveFocusedConversationId({
				previousConversationIds: ["conv-1", "conv-2", "conv-3"],
				nextConversationIds: ["conv-1", "conv-3"],
				focusedConversationId: "conv-2",
			})
		).toBe("conv-3");
	});

	it("falls back to the previous survivor when the last focused conversation disappears", () => {
		expect(
			resolveFocusedConversationId({
				previousConversationIds: ["conv-1", "conv-2", "conv-3"],
				nextConversationIds: ["conv-1", "conv-2"],
				focusedConversationId: "conv-3",
			})
		).toBe("conv-2");
	});

	it("computes a scroll target before the row reaches the viewport edge", () => {
		expect(
			getScrollTargetForRange({
				currentScrollTop: 0,
				viewportHeight: 400,
				itemStart: 320,
				itemEnd: 368,
				preferredSafeZone: 96,
				maxScrollTop: 600,
			})
		).toBe(64);

		expect(
			getScrollTargetForRange({
				currentScrollTop: 64,
				viewportHeight: 400,
				itemStart: 160,
				itemEnd: 208,
				preferredSafeZone: 96,
				maxScrollTop: 600,
			})
		).toBeNull();
	});
});
