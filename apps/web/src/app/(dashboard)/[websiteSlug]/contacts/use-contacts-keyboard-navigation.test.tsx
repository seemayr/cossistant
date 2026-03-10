import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const registeredHotkeys: Array<{
	handler: (...args: any[]) => void;
	keys: string | string[];
}> = [];

mock.module("react-hotkeys-hook", () => ({
	useHotkeys: (keys: string | string[], handler: (...args: any[]) => void) => {
		registeredHotkeys.push({ handler, keys });
	},
}));

const modulePromise = import("./use-contacts-keyboard-navigation");

function resetHotkeys() {
	registeredHotkeys.length = 0;
}

async function renderHook(props: any) {
	const { useContactsKeyboardNavigation } = await modulePromise;
	let hookValue: any = null;

	function Harness() {
		hookValue = useContactsKeyboardNavigation(props);
		return null;
	}

	renderToStaticMarkup(React.createElement(Harness));

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return hookValue as {
		focusedIndex: number;
	};
}

describe("useContactsKeyboardNavigation", () => {
	it("opens the focused contact on Enter when no detail page is active", async () => {
		resetHotkeys();
		const selectedContactIds: string[] = [];

		await renderHook({
			contacts: [{ id: "contact-1" }, { id: "contact-2" }],
			enabled: true,
			isDetailPageOpen: false,
			itemHeight: 52,
			onCloseDetailPage: () => {},
			onSelectContact: (contactId: string) => {
				selectedContactIds.push(contactId);
			},
			parentRef: { current: null },
			selectedContactId: null,
		});

		const enterHotkey = registeredHotkeys.find(
			(entry) => Array.isArray(entry.keys) && entry.keys.includes("Enter")
		);

		enterHotkey?.handler(
			{ preventDefault: () => {}, stopPropagation: () => {} },
			{ keys: ["enter"] }
		);

		expect(selectedContactIds).toEqual(["contact-1"]);
	});

	it("closes the detail page on Escape when a detail page is active", async () => {
		resetHotkeys();
		let closeCallCount = 0;

		await renderHook({
			contacts: [{ id: "contact-1" }],
			enabled: true,
			isDetailPageOpen: true,
			itemHeight: 52,
			onCloseDetailPage: () => {
				closeCallCount += 1;
			},
			onSelectContact: () => {},
			parentRef: { current: null },
			selectedContactId: "contact-1",
		});

		const escapeHotkey = registeredHotkeys.find(
			(entry) => entry.keys === "Escape"
		);

		escapeHotkey?.handler({
			preventDefault: () => {},
			stopPropagation: () => {},
		});

		expect(closeCallCount).toBe(1);
	});

	it("initializes focus from the selected contact id", async () => {
		resetHotkeys();

		const hookValue = await renderHook({
			contacts: [{ id: "contact-1" }, { id: "contact-2" }],
			enabled: true,
			isDetailPageOpen: false,
			itemHeight: 52,
			onCloseDetailPage: () => {},
			onSelectContact: () => {},
			parentRef: { current: null },
			selectedContactId: "contact-2",
		});

		expect(hookValue.focusedIndex).toBe(1);
	});
});
