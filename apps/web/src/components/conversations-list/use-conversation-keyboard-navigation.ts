"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useConversationFocusStore } from "@/contexts/inboxes/conversation-focus-store";
import {
	type ConversationListModel,
	getAdjacentConversationId,
	getScrollTargetForRange,
	resolveFocusedConversationId,
} from "./model";

const DEFAULT_SCROLL_SAFE_ZONE = 128;

type UseConversationKeyboardNavigationProps = {
	model: ConversationListModel;
	basePath: string;
	onLockedConversationEnter?: (conversationId: string) => void;
	parentRef: React.RefObject<HTMLDivElement | null>;
	scrollSafeZone?: number;
	enabled?: boolean;
};

function getInitialFocusedConversationId({
	model,
	shouldRestoreFocus,
	storedFocusedConversationId,
}: {
	model: ConversationListModel;
	shouldRestoreFocus: boolean;
	storedFocusedConversationId: string | null;
}): string | null {
	if (
		shouldRestoreFocus &&
		storedFocusedConversationId &&
		model.conversationById.has(storedFocusedConversationId)
	) {
		return storedFocusedConversationId;
	}

	return model.orderedConversationIds[0] ?? null;
}

export function useConversationKeyboardNavigation({
	model,
	basePath,
	onLockedConversationEnter,
	parentRef,
	scrollSafeZone = DEFAULT_SCROLL_SAFE_ZONE,
	enabled = true,
}: UseConversationKeyboardNavigationProps) {
	const router = useRouter();
	const lastInteractionRef = useRef<"keyboard" | "mouse">("keyboard");
	const hasInitializedRef = useRef(false);
	const previousConversationIdsRef = useRef(model.orderedConversationIds);

	const {
		focusedConversationId: storedFocusedConversationId,
		shouldRestoreFocus,
		setFocusedConversationId: storeFocusedConversationId,
		markFocusRestored,
	} = useConversationFocusStore();

	const [focusedConversationId, setFocusedConversationId] = useState<
		string | null
	>(() =>
		getInitialFocusedConversationId({
			model,
			shouldRestoreFocus,
			storedFocusedConversationId,
		})
	);

	const focusedIndex =
		focusedConversationId == null
			? -1
			: (model.conversationIdToItemIndex.get(focusedConversationId) ?? -1);

	const scrollToConversation = useCallback(
		(conversationId: string | null) => {
			if (!(conversationId && parentRef.current)) {
				return;
			}

			const itemIndex = model.conversationIdToItemIndex.get(conversationId);

			if (itemIndex == null) {
				return;
			}

			const itemStart = model.itemStarts[itemIndex];
			const itemEnd = model.itemEnds[itemIndex];

			if (itemStart == null || itemEnd == null) {
				return;
			}

			const container = parentRef.current;
			const maxScrollTop = Math.max(
				0,
				container.scrollHeight - container.clientHeight
			);
			const nextScrollTop = getScrollTargetForRange({
				currentScrollTop: container.scrollTop,
				viewportHeight: container.clientHeight,
				itemStart,
				itemEnd,
				preferredSafeZone: scrollSafeZone,
				maxScrollTop,
			});

			if (nextScrollTop != null) {
				container.scrollTop = nextScrollTop;
			}
		},
		[model, parentRef, scrollSafeZone]
	);

	const moveFocus = useCallback(
		(direction: "up" | "down") => {
			lastInteractionRef.current = "keyboard";

			const nextConversationId = getAdjacentConversationId(
				model,
				focusedConversationId,
				direction,
				true
			);

			if (!nextConversationId || nextConversationId === focusedConversationId) {
				return;
			}

			setFocusedConversationId(nextConversationId);
			scrollToConversation(nextConversationId);
		},
		[focusedConversationId, model, scrollToConversation]
	);

	const navigateToConversation = useCallback(() => {
		if (!focusedConversationId) {
			return;
		}

		const conversation = model.conversationById.get(focusedConversationId);

		if (!conversation) {
			return;
		}

		if (conversation.dashboardLocked) {
			onLockedConversationEnter?.(conversation.id);
			return;
		}

		storeFocusedConversationId(conversation.id);
		router.push(`${basePath}/${conversation.id}`);
	}, [
		basePath,
		focusedConversationId,
		model,
		onLockedConversationEnter,
		router,
		storeFocusedConversationId,
	]);

	const handleMouseEnter = useCallback((conversationId: string) => {
		lastInteractionRef.current = "mouse";
		setFocusedConversationId(conversationId);
	}, []);

	useHotkeys(
		["ArrowUp", "ArrowDown", "k", "j", "Enter"],
		(event, handler) => {
			if (!enabled) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			switch (handler.keys?.join("")) {
				case "arrowup":
				case "k":
					moveFocus("up");
					break;
				case "arrowdown":
				case "j":
					moveFocus("down");
					break;
				case "enter":
					navigateToConversation();
					break;
				default:
					break;
			}
		},
		{
			enabled,
			enableOnFormTags: false,
			enableOnContentEditable: false,
		},
		[enabled, moveFocus, navigateToConversation]
	);

	useEffect(() => {
		if (
			!enabled ||
			model.orderedConversationIds.length === 0 ||
			hasInitializedRef.current
		) {
			return;
		}

		const initialFocusedConversationId = getInitialFocusedConversationId({
			model,
			shouldRestoreFocus,
			storedFocusedConversationId,
		});

		setFocusedConversationId(initialFocusedConversationId);

		if (initialFocusedConversationId) {
			lastInteractionRef.current = "keyboard";
			scrollToConversation(initialFocusedConversationId);
		}

		if (
			shouldRestoreFocus &&
			storedFocusedConversationId &&
			initialFocusedConversationId === storedFocusedConversationId
		) {
			markFocusRestored();
		}

		hasInitializedRef.current = true;
		previousConversationIdsRef.current = model.orderedConversationIds;
	}, [
		enabled,
		model,
		markFocusRestored,
		scrollToConversation,
		shouldRestoreFocus,
		storedFocusedConversationId,
	]);

	useEffect(() => {
		if (!(enabled && hasInitializedRef.current)) {
			previousConversationIdsRef.current = model.orderedConversationIds;
			return;
		}

		const nextFocusedConversationId = resolveFocusedConversationId({
			previousConversationIds: previousConversationIdsRef.current,
			nextConversationIds: model.orderedConversationIds,
			focusedConversationId,
		});

		if (nextFocusedConversationId !== focusedConversationId) {
			setFocusedConversationId(nextFocusedConversationId);

			if (
				nextFocusedConversationId &&
				lastInteractionRef.current === "keyboard"
			) {
				scrollToConversation(nextFocusedConversationId);
			}
		}

		previousConversationIdsRef.current = model.orderedConversationIds;
	}, [
		enabled,
		focusedConversationId,
		model.orderedConversationIds,
		scrollToConversation,
	]);

	return {
		focusedConversationId,
		focusedIndex,
		handleMouseEnter,
		isKeyboardNavigation: lastInteractionRef.current === "keyboard",
	};
}
