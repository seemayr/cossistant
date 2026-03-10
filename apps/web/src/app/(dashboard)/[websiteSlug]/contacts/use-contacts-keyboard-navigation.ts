"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

type UseContactsKeyboardNavigationProps = {
	contacts: Array<{ id: string }>;
	parentRef: React.RefObject<HTMLDivElement | null>;
	itemHeight: number;
	enabled?: boolean;
	onSelectContact: (contactId: string) => void;
	onCloseDetailPage: () => void;
	isDetailPageOpen: boolean;
	selectedContactId: string | null;
};

export function useContactsKeyboardNavigation({
	contacts,
	parentRef,
	itemHeight,
	enabled = true,
	onSelectContact,
	onCloseDetailPage,
	isDetailPageOpen,
	selectedContactId,
}: UseContactsKeyboardNavigationProps) {
	const lastInteractionRef = useRef<"keyboard" | "mouse">("keyboard");
	const hasInitializedRef = useRef(false);

	// Initialize focus index - restore from URL if we have a selected contact
	const [focusedIndex, setFocusedIndex] = useState(() => {
		if (selectedContactId && contacts.length > 0) {
			const index = contacts.findIndex((c) => c.id === selectedContactId);
			if (index !== -1) {
				return index;
			}
		}
		return 0;
	});

	const scrollToItem = useCallback(
		(index: number) => {
			if (!parentRef.current) {
				return;
			}

			const container = parentRef.current;
			const itemTop = index * itemHeight;
			const itemBottom = itemTop + itemHeight;
			const scrollTop = container.scrollTop;
			const scrollBottom = scrollTop + container.clientHeight;

			if (itemTop < scrollTop) {
				container.scrollTop = itemTop;
			} else if (itemBottom > scrollBottom) {
				container.scrollTop = itemBottom - container.clientHeight;
			}
		},
		[itemHeight, parentRef]
	);

	const moveFocus = useCallback(
		(direction: "up" | "down") => {
			lastInteractionRef.current = "keyboard";
			setFocusedIndex((prevIndex) => {
				let newIndex = prevIndex;

				if (direction === "up") {
					newIndex = Math.max(0, prevIndex - 1);
				} else {
					newIndex = Math.min(contacts.length - 1, prevIndex + 1);
				}

				if (newIndex !== prevIndex) {
					scrollToItem(newIndex);
				}

				return newIndex;
			});
		},
		[contacts.length, scrollToItem]
	);

	const openSelectedContact = useCallback(() => {
		if (focusedIndex >= 0 && focusedIndex < contacts.length) {
			const contact = contacts[focusedIndex];
			if (contact) {
				onSelectContact(contact.id);
			}
		}
	}, [focusedIndex, contacts, onSelectContact]);

	const handleMouseEnter = useCallback((index: number) => {
		lastInteractionRef.current = "mouse";
		setFocusedIndex(index);
	}, []);

	// Navigation hotkeys (Arrow keys, j/k, Enter)
	useHotkeys(
		["ArrowUp", "ArrowDown", "k", "j", "Enter"],
		(event, handler) => {
			if (!enabled || isDetailPageOpen) {
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
					openSelectedContact();
					break;
				default:
					break;
			}
		},
		{
			enabled: enabled && !isDetailPageOpen,
			enableOnFormTags: false,
			enableOnContentEditable: false,
		},
		[moveFocus, openSelectedContact, enabled, isDetailPageOpen]
	);

	// Escape closes the detail page and returns focus to the list.
	useHotkeys(
		"Escape",
		(event) => {
			if (!(enabled && isDetailPageOpen)) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			onCloseDetailPage();
		},
		{
			enabled: enabled && isDetailPageOpen,
			enableOnFormTags: true,
			enableOnContentEditable: true,
		},
		[onCloseDetailPage, enabled, isDetailPageOpen]
	);

	// Initialize focus on mount
	useEffect(() => {
		if (!enabled || contacts.length === 0 || hasInitializedRef.current) {
			return;
		}

		if (selectedContactId) {
			const index = contacts.findIndex((c) => c.id === selectedContactId);
			if (index !== -1) {
				setFocusedIndex(index);
				scrollToItem(index);
				lastInteractionRef.current = "keyboard";
			} else {
				scrollToItem(0);
			}
		} else {
			scrollToItem(focusedIndex);
		}

		hasInitializedRef.current = true;
	}, [enabled, contacts, selectedContactId, scrollToItem, focusedIndex]);

	// Adjust focused index when contacts list changes
	useEffect(() => {
		if (focusedIndex >= contacts.length && contacts.length > 0) {
			setFocusedIndex(contacts.length - 1);
		}
	}, [contacts.length, focusedIndex]);

	// Update focused index when selected contact changes from URL
	useEffect(() => {
		if (selectedContactId && contacts.length > 0) {
			const index = contacts.findIndex((c) => c.id === selectedContactId);
			if (index !== -1 && index !== focusedIndex) {
				setFocusedIndex(index);
			}
		}
	}, [selectedContactId, contacts, focusedIndex]);

	return {
		focusedIndex,
		handleMouseEnter,
		isKeyboardNavigation: lastInteractionRef.current === "keyboard",
	};
}
