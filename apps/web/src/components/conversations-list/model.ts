export type ConversationListDirection = "up" | "down";

export type ConversationListConversation = {
	id: string;
	dashboardLocked?: boolean;
};

export type ConversationListRenderableItem<
	TConversation extends
		ConversationListConversation = ConversationListConversation,
> =
	| {
			type: "conversation";
			conversation: TConversation;
	  }
	| {
			type: "header";
			category?: string;
	  }
	| {
			type: "analytics";
	  };

export type ConversationListModel<
	TConversation extends
		ConversationListConversation = ConversationListConversation,
> = {
	itemCount: number;
	itemEnds: number[];
	itemKeys: Array<string | number>;
	itemSizes: number[];
	itemStarts: number[];
	orderedConversations: TConversation[];
	orderedConversationIds: string[];
	conversationById: Map<string, TConversation>;
	conversationIdToItemIndex: Map<string, number>;
	conversationIdToOrderIndex: Map<string, number>;
	totalSize: number;
};

type BuildConversationListModelOptions<
	TConversation extends ConversationListConversation,
> = {
	conversations: TConversation[];
	items?: ConversationListRenderableItem<TConversation>[] | null;
	itemHeight: number;
	headerHeight: number;
	analyticsHeight: number;
	gap?: number;
};

type ResolveFocusedConversationIdOptions = {
	previousConversationIds: string[];
	nextConversationIds: string[];
	focusedConversationId: string | null;
};

type GetScrollTargetForRangeOptions = {
	currentScrollTop: number;
	viewportHeight: number;
	itemStart: number;
	itemEnd: number;
	preferredSafeZone: number;
	maxScrollTop: number;
};

const DEFAULT_GAP = 4;

export const CONVERSATION_LIST_GAP = DEFAULT_GAP;

function getRenderableItems<
	TConversation extends ConversationListConversation,
>({
	conversations,
	items,
}: Pick<
	BuildConversationListModelOptions<TConversation>,
	"conversations" | "items"
>): ConversationListRenderableItem<TConversation>[] {
	if (items && items.length > 0) {
		return items;
	}

	return conversations.map((conversation) => ({
		type: "conversation",
		conversation,
	}));
}

function getItemKey<TConversation extends ConversationListConversation>(
	item: ConversationListRenderableItem<TConversation>,
	index: number
): string | number {
	if (item.type === "conversation") {
		return item.conversation.id;
	}

	if (item.type === "analytics") {
		return "analytics";
	}

	return item.category ? `header-${item.category}` : `header-${index}`;
}

function getItemSize<TConversation extends ConversationListConversation>(
	item: ConversationListRenderableItem<TConversation>,
	{
		itemHeight,
		headerHeight,
		analyticsHeight,
	}: Pick<
		BuildConversationListModelOptions<TConversation>,
		"analyticsHeight" | "headerHeight" | "itemHeight"
	>
): number {
	if (item.type === "header") {
		return headerHeight;
	}

	if (item.type === "analytics") {
		return analyticsHeight;
	}

	return itemHeight;
}

export function buildConversationListModel<
	TConversation extends ConversationListConversation,
>({
	conversations,
	items,
	itemHeight,
	headerHeight,
	analyticsHeight,
	gap = DEFAULT_GAP,
}: BuildConversationListModelOptions<TConversation>): ConversationListModel<TConversation> {
	const renderableItems = getRenderableItems({ conversations, items });
	const itemCount = renderableItems.length;
	const itemKeys: Array<string | number> = [];
	const itemSizes: number[] = [];
	const itemStarts: number[] = [];
	const itemEnds: number[] = [];
	const orderedConversations: TConversation[] = [];
	const orderedConversationIds: string[] = [];
	const conversationById = new Map<string, TConversation>();
	const conversationIdToItemIndex = new Map<string, number>();
	const conversationIdToOrderIndex = new Map<string, number>();

	let offset = 0;

	for (let index = 0; index < itemCount; index++) {
		const item = renderableItems[index];

		if (!item) {
			continue;
		}

		const itemSize = getItemSize(item, {
			itemHeight,
			headerHeight,
			analyticsHeight,
		});

		itemKeys.push(getItemKey(item, index));
		itemSizes.push(itemSize);
		itemStarts.push(offset);
		itemEnds.push(offset + itemSize);

		if (item.type === "conversation") {
			orderedConversations.push(item.conversation);
			orderedConversationIds.push(item.conversation.id);
			conversationById.set(item.conversation.id, item.conversation);
			conversationIdToItemIndex.set(item.conversation.id, index);
			conversationIdToOrderIndex.set(
				item.conversation.id,
				orderedConversations.length - 1
			);
		}

		offset += itemSize;

		if (index < itemCount - 1) {
			offset += gap;
		}
	}

	return {
		itemCount,
		itemEnds,
		itemKeys,
		itemSizes,
		itemStarts,
		orderedConversations,
		orderedConversationIds,
		conversationById,
		conversationIdToItemIndex,
		conversationIdToOrderIndex,
		totalSize: itemCount === 0 ? 0 : offset,
	};
}

export function getAdjacentConversationId<
	TConversation extends ConversationListConversation,
>(
	model: ConversationListModel<TConversation>,
	currentConversationId: string | null,
	direction: ConversationListDirection,
	wrap = false
): string | null {
	const { orderedConversationIds, conversationIdToOrderIndex } = model;

	if (orderedConversationIds.length === 0) {
		return null;
	}

	if (!currentConversationId) {
		return direction === "down"
			? (orderedConversationIds[0] ?? null)
			: (orderedConversationIds[orderedConversationIds.length - 1] ?? null);
	}

	const currentIndex = conversationIdToOrderIndex.get(currentConversationId);

	if (currentIndex == null) {
		return direction === "down"
			? (orderedConversationIds[0] ?? null)
			: (orderedConversationIds[orderedConversationIds.length - 1] ?? null);
	}

	const delta = direction === "down" ? 1 : -1;
	const adjacentIndex = currentIndex + delta;

	if (adjacentIndex >= 0 && adjacentIndex < orderedConversationIds.length) {
		return orderedConversationIds[adjacentIndex] ?? null;
	}

	if (!wrap) {
		return null;
	}

	return direction === "down"
		? (orderedConversationIds[0] ?? null)
		: (orderedConversationIds[orderedConversationIds.length - 1] ?? null);
}

export function resolveFocusedConversationId({
	previousConversationIds,
	nextConversationIds,
	focusedConversationId,
}: ResolveFocusedConversationIdOptions): string | null {
	if (nextConversationIds.length === 0) {
		return null;
	}

	if (!focusedConversationId) {
		return nextConversationIds[0] ?? null;
	}

	if (nextConversationIds.includes(focusedConversationId)) {
		return focusedConversationId;
	}

	const previousIndex = previousConversationIds.indexOf(focusedConversationId);

	if (previousIndex === -1) {
		return nextConversationIds[0] ?? null;
	}

	const remainingConversationIds = new Set(nextConversationIds);

	for (
		let nextIndex = previousIndex + 1;
		nextIndex < previousConversationIds.length;
		nextIndex++
	) {
		const candidateId = previousConversationIds[nextIndex];

		if (candidateId && remainingConversationIds.has(candidateId)) {
			return candidateId;
		}
	}

	for (
		let previousIndexCandidate = previousIndex - 1;
		previousIndexCandidate >= 0;
		previousIndexCandidate--
	) {
		const candidateId = previousConversationIds[previousIndexCandidate];

		if (candidateId && remainingConversationIds.has(candidateId)) {
			return candidateId;
		}
	}

	return nextConversationIds[0] ?? null;
}

export function getScrollTargetForRange({
	currentScrollTop,
	viewportHeight,
	itemStart,
	itemEnd,
	preferredSafeZone,
	maxScrollTop,
}: GetScrollTargetForRangeOptions): number | null {
	if (viewportHeight <= 0) {
		return null;
	}

	const itemSize = Math.max(0, itemEnd - itemStart);
	const safeZone = Math.min(
		preferredSafeZone,
		Math.max(0, Math.floor((viewportHeight - itemSize) / 2))
	);
	const minVisibleTop = currentScrollTop + safeZone;
	const maxVisibleBottom = currentScrollTop + viewportHeight - safeZone;

	if (itemStart < minVisibleTop) {
		return Math.max(0, Math.min(itemStart - safeZone, maxScrollTop));
	}

	if (itemEnd > maxVisibleBottom) {
		return Math.max(
			0,
			Math.min(itemEnd + safeZone - viewportHeight, maxScrollTop)
		);
	}

	return null;
}
