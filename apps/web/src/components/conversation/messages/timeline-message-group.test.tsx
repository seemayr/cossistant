import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import { Window } from "happy-dom";
import type React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

const translateMessageGroupMock = mock((async () => ({
	items: [],
	skippedIds: [],
	translatedCount: 2,
	skippedCount: 0,
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("@cossistant/core", () => ({
	getTimelineItemTranslation: (
		item: { parts: unknown[] },
		audience: "team" | "visitor"
	) =>
		item.parts.find(
			(part) =>
				part &&
				typeof part === "object" &&
				"type" in part &&
				part.type === "translation" &&
				"audience" in part &&
				part.audience === audience
		) ?? null,
	shouldTranslateBetweenLanguages: () => true,
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: (options: { onSuccess?: (data: unknown) => void } = {}) => ({
		mutateAsync: async (input: unknown) => {
			const result = await translateMessageGroupMock(input);
			options.onSuccess?.(result);
			return result;
		},
		isPending: false,
	}),
}));

mock.module("@/components/plan/button-with-paywall", () => ({
	ButtonWithPaywall: ({
		children,
		onClick,
		featureKey: _featureKey,
		websiteSlug: _websiteSlug,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		featureKey?: string;
		websiteSlug?: string;
	}) => (
		<button {...props} onClick={onClick} type={props.type ?? "button"}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props} onClick={onClick} type={props.type ?? "button"}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({
		fallbackName,
		className,
		lastOnlineAt: _lastOnlineAt,
	}: React.HTMLAttributes<HTMLDivElement> & {
		fallbackName: string;
		lastOnlineAt?: string | null;
	}) => (
		<div className={className} data-slot="avatar">
			{fallbackName}
		</div>
	),
}));

mock.module("@/components/ui/logo", () => ({
	Logo: (props: React.HTMLAttributes<HTMLDivElement>) => (
		<div data-slot="logo" {...props} />
	),
}));

mock.module("@/contexts/website", () => ({
	useOptionalWebsite: () => ({
		slug: "acme",
		defaultLanguage: "en",
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		conversation: {
			translateMessageGroup: {
				mutationOptions: (options: unknown) => options,
			},
		},
	}),
}));

mock.module("@/lib/human-agent-display", () => ({
	resolveDashboardHumanAgentDisplay: ({
		id,
		name,
	}: {
		id: string;
		name: string | null;
	}) => ({
		displayName: name ?? id,
		facehashSeed: id,
	}),
}));

mock.module("@/lib/visitors", () => ({
	getVisitorNameWithFallback: () => "Marc",
}));

mock.module("./read-indicator", () => ({
	ReadIndicator: () => null,
}));

mock.module("./timeline-message-item", () => ({
	TimelineMessageItem: ({
		item,
		showOriginal = false,
	}: {
		item: TimelineItem;
		showOriginal?: boolean;
	}) => {
		const translation = item.parts.find(
			(part) =>
				part &&
				typeof part === "object" &&
				"type" in part &&
				part.type === "translation" &&
				"audience" in part &&
				part.audience === "team"
		) as { text?: string } | undefined;
		const text =
			showOriginal && translation
				? item.text
				: (translation?.text ?? item.text);

		return <div data-timeline-message-item={item.id}>{text}</div>;
	},
}));

mock.module("@cossistant/next/primitives", () => ({
	TimelineItemGroup: ({
		children,
		items,
		lastReadItemIds: _lastReadItemIds,
		viewerId: _viewerId,
		viewerType: _viewerType,
		...props
	}: {
		children: React.ReactNode | ((props: unknown) => React.ReactNode);
		items: TimelineItem[];
		lastReadItemIds?: string[];
		viewerId?: string;
		viewerType?: string;
	}) => (
		<div {...props}>
			{typeof children === "function"
				? children({
						isSentByViewer: false,
						isReceivedByViewer: true,
						isVisitor: Boolean(items[0]?.visitorId),
						isAI: Boolean(items[0]?.aiAgentId),
					})
				: children}
		</div>
	),
	TimelineItemGroupAvatar: ({
		children,
		...props
	}: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
	TimelineItemGroupContent: ({
		children,
		...props
	}: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
	TimelineItemGroupHeader: ({
		children,
		...props
	}: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

mock.module("motion/react", () => ({
	motion: {
		div: ({
			children,
			...props
		}: React.HTMLAttributes<HTMLDivElement> & {
			children: React.ReactNode;
		}) => <div {...props}>{children}</div>,
	},
}));

mock.module("sonner", () => ({
	toast: {
		error: mock(() => {}),
	},
}));

const modulePromise = import("./timeline-message-group");

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
	"MouseEvent",
	"Node",
	"SVGElement",
	"SyntaxError",
	"Text",
	"getComputedStyle",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(window: Window) {
	(window as Window & { SyntaxError?: typeof Error }).SyntaxError = Error;
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
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SVGElement", window.SVGElement);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

async function renderGroup(items: TimelineItem[]) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { TimelineMessageGroup } = await modulePromise;

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(
			<TimelineMessageGroup
				availableAIAgents={[]}
				conversationVisitorLanguage="es"
				currentUserId="user-1"
				items={items}
				teamMembers={[]}
				visitor={
					{
						id: "visitor-1",
						contact: {
							name: "Marc",
							email: "marc@example.com",
							image: null,
						},
					} as never
				}
			/>
		);
	});
}

function createItem(
	id: string,
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id,
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "message",
		text: id,
		parts: [{ type: "text", text: id }],
		userId: null,
		visitorId: "visitor-1",
		aiAgentId: null,
		createdAt: "2026-04-13T10:05:00",
		deletedAt: null,
		tool: null,
		...overrides,
	};
}

describe("TimelineMessageGroup", () => {
	beforeEach(() => {
		translateMessageGroupMock.mockReset();
		translateMessageGroupMock.mockResolvedValue({
			items: [],
			skippedIds: [],
			translatedCount: 2,
			skippedCount: 0,
		});
		activeRoot = null;
		mountNode = null;
		windowInstance = new Window({
			url: "https://example.com",
		});
		installDomGlobals(windowInstance);
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

	it("renders one translate control in the group footer next to the timestamp", async () => {
		await renderGroup([createItem("msg-1"), createItem("msg-2")]);

		const footer = document.querySelector(
			'[data-translation-group-footer="true"]'
		);
		const actions = document.querySelectorAll(
			'[data-translation-group-action="translate"]'
		);

		expect(footer?.textContent).toContain("10:05");
		expect(actions).toHaveLength(1);
		expect(actions[0]?.getAttribute("class")).toContain("text-xs");
	});

	it("translates every eligible message in the group with one click", async () => {
		const { act } = await import("react");

		await renderGroup([createItem("msg-1"), createItem("msg-2")]);

		const translateButton = document.querySelector(
			'[data-translation-group-action="translate"]'
		);

		await act(async () => {
			translateButton?.dispatchEvent(
				new window.MouseEvent("click", { bubbles: true })
			);
		});

		expect(translateMessageGroupMock).toHaveBeenCalledWith({
			conversationId: "conv-1",
			websiteSlug: "acme",
			timelineItemIds: ["msg-1", "msg-2"],
		});
	});

	it("toggles every translated message in the group back to its original text", async () => {
		const { act } = await import("react");

		await renderGroup([
			createItem("msg-1", {
				text: "Hola equipo",
				parts: [
					{ type: "text", text: "Hola equipo" },
					{
						type: "translation",
						text: "Hello team",
						sourceLanguage: "es",
						targetLanguage: "en",
						audience: "team",
						mode: "auto",
						modelId: "test-model",
					},
				],
			}),
			createItem("msg-2", {
				text: "Necesito ayuda",
				parts: [
					{ type: "text", text: "Necesito ayuda" },
					{
						type: "translation",
						text: "I need help",
						sourceLanguage: "es",
						targetLanguage: "en",
						audience: "team",
						mode: "auto",
						modelId: "test-model",
					},
				],
			}),
		]);

		expect(document.body.textContent).toContain("Hello team");
		expect(document.body.textContent).toContain("I need help");
		expect(document.body.textContent).not.toContain("Hola equipo");
		expect(document.body.textContent).not.toContain("Necesito ayuda");

		const toggleButton = document.querySelector(
			'[data-translation-group-action="toggle-original"]'
		);

		await act(async () => {
			toggleButton?.dispatchEvent(
				new window.MouseEvent("click", { bubbles: true })
			);
		});

		expect(document.body.textContent).toContain("Hola equipo");
		expect(document.body.textContent).toContain("Necesito ayuda");
		expect(document.body.textContent).not.toContain("Hello team");
		expect(document.body.textContent).not.toContain("I need help");
	});
});
