import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	createTypingStore,
	setTypingState as setStoreTypingState,
	type TypingStore,
} from "@cossistant/core";
import type { SupportControllerSnapshot } from "@cossistant/core/support-controller";
import type React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { SupportProvider } from "../provider";
import {
	setTypingState as setSharedTypingState,
	typingStoreSingleton,
} from "../realtime/typing-store";
import { createMockSupportController } from "../test-utils/create-mock-support-controller";
import { useConversationTyping } from "./use-conversation-typing";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;

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

function clearSharedTypingStore() {
	for (const conversationId of Object.keys(
		typingStoreSingleton.getState().conversations
	)) {
		typingStoreSingleton.clearConversation(conversationId);
	}
}

async function renderTyping(
	conversationId: string,
	client: { typingStore: TypingStore } | null,
	options: {
		excludeVisitorId?: string | null;
		excludeUserId?: string | null;
		excludeAiAgentId?: string | null;
	} = {}
) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	const controller = createMockSupportController({
		client: client as SupportControllerSnapshot["client"],
	});
	let result: ReturnType<typeof useConversationTyping> = [];

	function Harness() {
		result = useConversationTyping(conversationId, options);
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

describe("useConversationTyping", () => {
	beforeEach(() => {
		windowInstance = new Window({
			url: "https://example.com",
		});
		installDomGlobals(windowInstance);
		clearSharedTypingStore();
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
		clearSharedTypingStore();

		for (const key of installedGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
		}
	});

	it("falls back to the shared typing store when the provider client is absent", async () => {
		const conversationId = "conv-typing-hook-fallback";

		setSharedTypingState({
			conversationId,
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
			preview: "Hello from the dashboard",
		});

		const entries = await renderTyping(conversationId, null);

		expect(entries).toEqual([
			{
				actorType: "visitor",
				actorId: "visitor-1",
				preview: "Hello from the dashboard",
				updatedAt: entries[0]?.updatedAt,
			},
		]);
	});

	it("ignores the current user while keeping visitor and AI typing entries", async () => {
		const conversationId = "conv-typing-hook-filtering";
		let now = 0;
		const typingStore = createTypingStore(undefined, {
			now: () => {
				now += 1;
				return now;
			},
		});

		setStoreTypingState(typingStore, {
			conversationId,
			actorType: "visitor",
			actorId: "visitor-1",
			isTyping: true,
			preview: "I am typing",
		});
		setStoreTypingState(typingStore, {
			conversationId,
			actorType: "user",
			actorId: "user-1",
			isTyping: true,
			preview: null,
		});
		setStoreTypingState(typingStore, {
			conversationId,
			actorType: "ai_agent",
			actorId: "ai-1",
			isTyping: true,
			preview: null,
		});

		const entries = await renderTyping(
			conversationId,
			{ typingStore },
			{
				excludeUserId: "user-1",
			}
		);

		expect(
			entries.map((entry) => ({
				actorType: entry.actorType,
				actorId: entry.actorId,
				preview: entry.preview,
			}))
		).toEqual([
			{
				actorType: "visitor",
				actorId: "visitor-1",
				preview: "I am typing",
			},
			{
				actorType: "ai_agent",
				actorId: "ai-1",
				preview: null,
			},
		]);
	});
});
