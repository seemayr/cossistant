import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	applyConversationSeenEvent,
	createSeenStore,
	hydrateConversationSeen,
	type SeenStore,
} from "@cossistant/core";
import type { SupportControllerSnapshot } from "@cossistant/core/support-controller";
import type React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { SupportProvider } from "../provider";
import { createMockSupportController } from "../test-utils/create-mock-support-controller";
import { useConversationSeen } from "./use-conversation-seen";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;
let currentStore: SeenStore;

const installedGlobalKeys = [
	"window",
	"self",
	"document",
	"navigator",
	"Document",
	"DocumentFragment",
	"Element",
	"Event",
	"EventTarget",
	"HTMLElement",
	"MutationObserver",
	"Node",
	"Text",
	"getComputedStyle",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(window: Window) {
	setGlobalValue("window", window);
	setGlobalValue("self", window);
	setGlobalValue("document", window.document);
	setGlobalValue("navigator", window.navigator);
	setGlobalValue("Document", window.Document);
	setGlobalValue("DocumentFragment", window.DocumentFragment);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("MutationObserver", window.MutationObserver);
	setGlobalValue("Node", window.Node);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("requestAnimationFrame", (callback: FrameRequestCallback) =>
		window.setTimeout(() => callback(Date.now()), 0)
	);
	setGlobalValue("cancelAnimationFrame", (id: number) =>
		window.clearTimeout(id)
	);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

async function renderSeen(conversationId = "conv-1") {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	const controller = createMockSupportController({
		client: {
			seenStore: currentStore,
		} as SupportControllerSnapshot["client"],
	});
	let result: ReturnType<typeof useConversationSeen> = [];

	function Harness() {
		result = useConversationSeen(conversationId);
		return null;
	}

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(
			<SupportProvider autoConnect={false} controller={controller}>
				<Harness />
			</SupportProvider>
		);
	});

	await act(async () => {
		activeRoot?.unmount();
	});

	controller.destroy();
	mountNode.remove();
	activeRoot = null;
	mountNode = null;

	return result;
}

describe("useConversationSeen", () => {
	beforeEach(() => {
		windowInstance = new Window({
			url: "https://example.com",
		});
		installDomGlobals(windowInstance);
		currentStore = createSeenStore();
	});

	afterEach(async () => {
		const { act } = await import("react");

		if (activeRoot) {
			await act(async () => {
				activeRoot?.unmount();
			});
		}

		mountNode?.remove();
		activeRoot = null;
		mountNode = null;
		windowInstance = null;

		for (const key of installedGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
		}
	});

	it("reflects hydrated seen state without changing the conversation id", async () => {
		expect(await renderSeen()).toEqual([]);

		hydrateConversationSeen(currentStore, "conv-1", [
			{
				id: "seen-1",
				conversationId: "conv-1",
				userId: "user-1",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: "2026-03-09T10:00:00.000Z",
				createdAt: "2026-03-09T10:00:00.000Z",
				updatedAt: "2026-03-09T10:00:00.000Z",
				deletedAt: null,
			},
		]);

		expect(await renderSeen()).toEqual([
			{
				id: "conv-1-user-user-1",
				conversationId: "conv-1",
				userId: "user-1",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: "2026-03-09T10:00:00.000Z",
				createdAt: "2026-03-09T10:00:00.000Z",
				updatedAt: "2026-03-09T10:00:00.000Z",
				deletedAt: null,
			},
		]);
	});

	it("surfaces realtime user reads and ignores visitor self-seen updates", async () => {
		applyConversationSeenEvent(currentStore, {
			type: "conversationSeen",
			payload: {
				websiteId: "website-1",
				organizationId: "org-1",
				conversationId: "conv-1",
				actorType: "user",
				actorId: "user-1",
				userId: "user-1",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: "2026-03-09T11:00:00.000Z",
			},
		});

		applyConversationSeenEvent(
			currentStore,
			{
				type: "conversationSeen",
				payload: {
					websiteId: "website-1",
					organizationId: "org-1",
					conversationId: "conv-1",
					actorType: "visitor",
					actorId: "visitor-1",
					userId: null,
					visitorId: "visitor-1",
					aiAgentId: null,
					lastSeenAt: "2026-03-09T11:05:00.000Z",
				},
			},
			{ ignoreVisitorId: "visitor-1" }
		);

		expect(await renderSeen()).toEqual([
			{
				id: "conv-1-user-user-1",
				conversationId: "conv-1",
				userId: "user-1",
				visitorId: null,
				aiAgentId: null,
				lastSeenAt: "2026-03-09T11:00:00.000Z",
				createdAt: "2026-03-09T11:00:00.000Z",
				updatedAt: "2026-03-09T11:00:00.000Z",
				deletedAt: null,
			},
		]);
	});
});
