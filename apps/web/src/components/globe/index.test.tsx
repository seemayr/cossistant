import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import type React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

type MockGlobeInstance = {
	destroy: ReturnType<typeof mock>;
	update: ReturnType<typeof mock>;
};

const createdGlobes: MockGlobeInstance[] = [];
const createGlobeMock = mock((_canvas: unknown, _options: unknown) => {
	const instance = {
		destroy: mock(() => {}),
		update: mock(() => {}),
	};

	createdGlobes.push(instance);
	return instance;
});
const resizeObserverDisconnectMock = mock(() => {});
const resizeObserverObserveMock = mock((_element: Element) => {});
const requestAnimationFrameMock = mock((callback: (time: number) => void) => {
	const id = nextAnimationFrameId++;
	animationFrameCallbacks.set(id, callback);
	return id;
});
const cancelAnimationFrameMock = mock((id: number) => {
	animationFrameCallbacks.delete(id);
});
const setPointerCaptureMock = mock(() => {});
const releasePointerCaptureMock = mock(() => {});
const cssSupportsMock = mock(() => false);

mock.module("cobe", () => ({
	default: createGlobeMock,
}));

mock.module("next-themes", () => ({
	useTheme: () => ({
		resolvedTheme: "light",
	}),
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({ fallbackName }: { fallbackName: string }) => (
		<div data-name={fallbackName} data-slot="mock-avatar" />
	),
}));

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;
let globeSize = { height: 0, width: 0 };
let createdImages: HTMLImageElement[] = [];
let animationFrameCallbacks = new Map<number, (time: number) => void>();
let nextAnimationFrameId = 1;

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
	"Image",
	"MutationObserver",
	"Node",
	"SVGElement",
	"Text",
	"CSS",
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
	setGlobalValue("Image", window.Image);
	setGlobalValue("MutationObserver", window.MutationObserver);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SVGElement", window.SVGElement);
	setGlobalValue("Text", window.Text);
	setGlobalValue("CSS", {
		supports: cssSupportsMock,
	});
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("ResizeObserver", MockResizeObserver);
	setGlobalValue("requestAnimationFrame", requestAnimationFrameMock);
	setGlobalValue("cancelAnimationFrame", cancelAnimationFrameMock);
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

	Object.defineProperty(window.HTMLElement.prototype, "setPointerCapture", {
		configurable: true,
		value: setPointerCaptureMock,
	});

	Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
		configurable: true,
		value: releasePointerCaptureMock,
	});
}

function getGlobeRoot() {
	return Array.from(document.getElementsByTagName("div")).find(
		(element) => element.getAttribute("data-slot") === "globe-root"
	) as HTMLElement | undefined;
}

function getLastGlobeInstance() {
	return createdGlobes.at(-1);
}

function runAnimationFrame(time: number) {
	const callbacks = Array.from(animationFrameCallbacks.values());
	animationFrameCallbacks.clear();

	for (const callback of callbacks) {
		callback(time);
	}
}

function dispatchPointerEvent(
	target: HTMLElement,
	type: string,
	coords: {
		clientX: number;
		clientY: number;
		pointerId?: number;
	}
) {
	const event = new (windowInstance?.Event ?? Event)(type, {
		bubbles: true,
		cancelable: true,
	});

	Object.defineProperties(event, {
		clientX: {
			configurable: true,
			value: coords.clientX,
		},
		clientY: {
			configurable: true,
			value: coords.clientY,
		},
		pointerId: {
			configurable: true,
			value: coords.pointerId ?? 1,
		},
	});

	target.dispatchEvent(event as unknown as Event);
}

describe("Globe", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		windowInstance = new Window({
			url: "https://example.com",
		});
		globeSize = { height: 0, width: 0 };
		createdImages = [];
		createdGlobes.length = 0;
		animationFrameCallbacks = new Map();
		nextAnimationFrameId = 1;
		createGlobeMock.mockReset();
		createGlobeMock.mockImplementation(
			(_canvas: unknown, _options: unknown) => {
				const instance = {
					destroy: mock(() => {}),
					update: mock(() => {}),
				};

				createdGlobes.push(instance);
				return instance;
			}
		);
		resizeObserverDisconnectMock.mockReset();
		resizeObserverObserveMock.mockReset();
		requestAnimationFrameMock.mockClear();
		cancelAnimationFrameMock.mockClear();
		setPointerCaptureMock.mockClear();
		releasePointerCaptureMock.mockClear();
		cssSupportsMock.mockReset();
		cssSupportsMock.mockImplementation(() => false);
		MockResizeObserver.callback = null;
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

	it("resolves responsive render scale and offset from the container size", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);
		globeSize = { height: 240, width: 320 };

		await act(async () => {
			activeRoot?.render(
				<Globe
					allowDrag={false}
					autoRotate={false}
					renderOffset={{ x: "10%", y: "-25%" }}
					renderScale={1.2}
				/>
			);
		});

		await act(async () => {
			MockResizeObserver.trigger();
		});

		const createGlobeCall = createGlobeMock.mock.calls[0]?.[1] as
			| {
					offset?: [number, number];
					scale?: number;
			  }
			| undefined;

		expect(createGlobeCall?.offset).toEqual([32, -60]);
		expect(createGlobeCall?.scale).toBe(1.2);

		const globeInstance = getLastGlobeInstance();
		globeInstance?.update.mockReset();
		globeSize = { height: 100, width: 200 };

		await act(async () => {
			MockResizeObserver.trigger();
		});

		expect(globeInstance?.update).toHaveBeenCalledWith(
			expect.objectContaining({
				offset: [20, -25],
				scale: 1.2,
			})
		);
	});

	it("applies a default min-height and lets callers override it", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);

		await act(async () => {
			activeRoot?.render(<Globe allowDrag={false} autoRotate={false} />);
		});

		let globeRoot = getGlobeRoot();

		expect(globeRoot?.style.minHeight).toBe("220px");

		await act(async () => {
			activeRoot?.render(
				<Globe allowDrag={false} autoRotate={false} minHeight={260} />
			);
		});

		globeRoot = getGlobeRoot();

		expect(globeRoot?.style.minHeight).toBe("260px");
	});

	it("initializes focused globes with front-facing cobe angles", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");
		const { getPhiFromLongitudeDegrees, getThetaFromTiltDegrees } =
			await import("./model");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);
		globeSize = { height: 280, width: 280 };

		await act(async () => {
			activeRoot?.render(
				<Globe
					autoRotate={false}
					focus={{
						latitude: 13.7101,
						longitude: 100.4543,
					}}
				/>
			);
		});

		await act(async () => {
			MockResizeObserver.trigger();
		});

		const createGlobeCall = createGlobeMock.mock.calls[0]?.[1] as
			| {
					phi: number;
					theta: number;
			  }
			| undefined;

		expect(createGlobeCall?.phi).toBeCloseTo(
			getPhiFromLongitudeDegrees(100.4543),
			6
		);
		expect(createGlobeCall?.theta).toBeCloseTo(
			getThetaFromTiltDegrees(13.7101),
			6
		);
	});

	it("does not auto-rotate while a focus target is active", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);
		globeSize = { height: 280, width: 280 };

		await act(async () => {
			activeRoot?.render(
				<Globe
					focus={{
						latitude: 13.7101,
						longitude: 100.4543,
					}}
				/>
			);
		});

		await act(async () => {
			MockResizeObserver.trigger();
		});

		const globeInstance = getLastGlobeInstance();
		expect(globeInstance).toBeDefined();
		globeInstance?.update.mockReset();

		await act(async () => {
			runAnimationFrame(16);
			runAnimationFrame(32);
			runAnimationFrame(48);
		});

		expect(globeInstance?.update).not.toHaveBeenCalled();
	});

	it("renders the anchored visitor overlay only when CSS anchor positioning is supported", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");

		cssSupportsMock.mockImplementation(() => true);
		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);
		globeSize = { height: 240, width: 320 };

		await act(async () => {
			activeRoot?.render(
				<Globe
					autoRotate={false}
					visitors={[
						{
							id: "visitor-1",
							latitude: 13.7101,
							longitude: 100.4543,
							name: "Anthony",
						},
					]}
				/>
			);
		});

		await act(async () => {
			MockResizeObserver.trigger();
		});

		expect(document.body.innerHTML).toContain('data-slot="globe-visitor-pin"');
	});

	it("falls back to surface markers when CSS anchor positioning is unsupported", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);
		globeSize = { height: 240, width: 320 };

		await act(async () => {
			activeRoot?.render(
				<Globe
					autoRotate={false}
					visitors={[
						{
							id: "visitor-1",
							latitude: 13.7101,
							longitude: 100.4543,
							name: "Anthony",
						},
					]}
				/>
			);
		});

		await act(async () => {
			MockResizeObserver.trigger();
		});

		expect(document.body.innerHTML).not.toContain(
			'data-slot="globe-visitor-pin"'
		);
	});

	it("stays hidden until the globe texture is ready, then redraws and fades in", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");

		const redrawTextureStates: boolean[] = [];
		let internalTextureReady = false;

		createGlobeMock.mockReset();
		createGlobeMock.mockImplementation(
			(_canvas: unknown, _options: unknown) => {
				const image = new Image();
				const instance = {
					destroy: mock(() => {}),
					update: mock(() => {
						redrawTextureStates.push(internalTextureReady);
					}),
				};

				image.onload = () => {
					internalTextureReady = true;
				};
				createdImages.push(image);
				createdGlobes.push(instance);
				return instance;
			}
		);

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);
		globeSize = { height: 240, width: 320 };

		await act(async () => {
			activeRoot?.render(<Globe allowDrag={false} autoRotate={false} />);
		});

		await act(async () => {
			MockResizeObserver.trigger();
		});

		const globeRoot = getGlobeRoot();
		const globeInstance = getLastGlobeInstance();

		expect(createdImages).toHaveLength(1);
		expect(globeRoot?.className).toContain("opacity-0");
		redrawTextureStates.length = 0;
		globeInstance?.update.mockReset();
		globeInstance?.update.mockImplementation(() => {
			redrawTextureStates.push(internalTextureReady);
		});

		await act(async () => {
			createdImages[0]?.dispatchEvent(new Event("load"));
			runAnimationFrame(16);
			runAnimationFrame(32);
			runAnimationFrame(48);
			runAnimationFrame(64);
		});

		expect(globeInstance?.update).toHaveBeenCalled();
		expect(redrawTextureStates).toEqual([true]);
		expect(globeRoot?.className).toContain("opacity-100");
	});

	it("allows dragging while focused and eases back after an idle delay", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { Globe } = await import("./index");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);
		globeSize = { height: 280, width: 280 };

		await act(async () => {
			activeRoot?.render(
				<Globe
					autoRotate={false}
					focus={{
						latitude: 13.7101,
						longitude: 100.4543,
					}}
					visitors={[
						{
							id: "visitor-1",
							latitude: 13.7101,
							longitude: 100.4543,
							name: "Anthony",
						},
					]}
				/>
			);
		});

		await act(async () => {
			MockResizeObserver.trigger();
		});

		const globeRoot = getGlobeRoot();
		const globeInstance = getLastGlobeInstance();

		expect(globeRoot?.className).toContain("cursor-grab");
		expect(globeInstance).toBeDefined();
		globeInstance?.update.mockReset();

		await act(async () => {
			dispatchPointerEvent(globeRoot as HTMLElement, "pointerdown", {
				clientX: 120,
				clientY: 100,
			});
			dispatchPointerEvent(globeRoot as HTMLElement, "pointermove", {
				clientX: 180,
				clientY: 130,
			});
		});

		expect(globeInstance?.update).toHaveBeenCalled();
		globeInstance?.update.mockReset();

		await act(async () => {
			dispatchPointerEvent(globeRoot as HTMLElement, "pointerup", {
				clientX: 180,
				clientY: 130,
			});
			runAnimationFrame(200);
			runAnimationFrame(500);
		});

		expect(globeInstance?.update).not.toHaveBeenCalled();

		await act(async () => {
			runAnimationFrame(1200);
		});

		expect(globeInstance?.update).toHaveBeenCalled();
	});
});
