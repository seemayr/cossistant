import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import type React from "react";

const createGlobeMock = mock(() => ({
	destroy: mock(() => {}),
	update: mock(() => {}),
}));

mock.module("cobe", () => ({
	default: createGlobeMock,
}));

mock.module("next-themes", () => ({
	useTheme: () => ({
		resolvedTheme: "light",
	}),
}));

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;
let globeSize = { height: 0, width: 0 };
const resizeObserverDisconnectMock = mock(() => {});
const resizeObserverObserveMock = mock((_element: Element) => {});
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
	"HTMLCanvasElement",
	"MutationObserver",
	"Node",
	"SVGElement",
	"Text",
	"getComputedStyle",
	"ResizeObserver",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

class MockResizeObserver {
	static callback: (() => void) | null = null;

	disconnect = resizeObserverDisconnectMock;
	observe = resizeObserverObserveMock;

	constructor(callback: () => void) {
		MockResizeObserver.callback = callback;
	}

	static trigger() {
		MockResizeObserver.callback?.();
	}
}

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
	setGlobalValue("HTMLCanvasElement", window.HTMLCanvasElement);
	setGlobalValue("MutationObserver", window.MutationObserver);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SVGElement", window.SVGElement);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("ResizeObserver", MockResizeObserver);
	setGlobalValue(
		"requestAnimationFrame",
		mock(() => 1)
	);
	setGlobalValue(
		"cancelAnimationFrame",
		mock(() => {})
	);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);

	Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
		configurable: true,
		get() {
			return this.getAttribute("data-slot") === "globe-root"
				? globeSize.height
				: 0;
		},
	});

	Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
		configurable: true,
		get() {
			return this.getAttribute("data-slot") === "globe-root"
				? globeSize.width
				: 0;
		},
	});
}

describe("Globe", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		windowInstance = new Window({
			url: "https://example.com",
		});
		globeSize = { height: 0, width: 0 };
		createGlobeMock.mockReset();
		createGlobeMock.mockImplementation(() => ({
			destroy: mock(() => {}),
			update: mock(() => {}),
		}));
		MockResizeObserver.callback = null;
		resizeObserverDisconnectMock.mockReset();
		resizeObserverObserveMock.mockReset();
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

	it("retries globe creation after an initial zero-size mount", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);

		await act(async () => {
			activeRoot?.render(<Globe allowDrag={false} autoRotate={false} />);
		});

		expect(createGlobeMock).not.toHaveBeenCalled();
		expect(document.body.innerHTML).toContain('data-slot="globe-root"');
		expect(resizeObserverObserveMock).toHaveBeenCalledTimes(1);

		globeSize = { height: 240, width: 320 };

		await act(async () => {
			MockResizeObserver.trigger();
		});

		expect(createGlobeMock).toHaveBeenCalledTimes(1);
		const createGlobeCalls = createGlobeMock.mock.calls as unknown as [
			unknown,
			{ height: number; width: number },
		][];

		expect(createGlobeCalls[0]?.[1]).toMatchObject({
			height: 240,
			width: 320,
		});

		await act(async () => {
			MockResizeObserver.trigger();
		});

		expect(createGlobeMock).toHaveBeenCalledTimes(1);
	});
});
