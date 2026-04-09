import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

mock.module("react-hotkeys-hook", () => ({
	useHotkeys: () => {},
}));

mock.module("motion/react", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	motion: {
		div: ({
			children,
			animate: _animate,
			exit: _exit,
			initial: _initial,
			layout: _layout,
			transition: _transition,
			...props
		}: React.HTMLAttributes<HTMLDivElement> &
			Record<string, unknown> & { children: React.ReactNode }) => (
			<div {...props}>{children}</div>
		),
	},
	useReducedMotion: () => false,
}));

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
	"FocusEvent",
	"HTMLElement",
	"HTMLInputElement",
	"HTMLSelectElement",
	"MouseEvent",
	"Node",
	"SVGElement",
	"SyntaxError",
	"Text",
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
	const syntaxErrorCtor = window.Error ?? Error;

	setGlobalValue("window", window);
	setGlobalValue("self", window);
	setGlobalValue("document", window.document);
	setGlobalValue("navigator", window.navigator);
	setGlobalValue("Document", window.Document);
	setGlobalValue("DocumentFragment", window.DocumentFragment);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("FocusEvent", window.FocusEvent);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("HTMLInputElement", window.HTMLInputElement);
	setGlobalValue("HTMLSelectElement", window.HTMLSelectElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SVGElement", window.SVGElement);
	Object.defineProperty(window, "SyntaxError", {
		configurable: true,
		value: syntaxErrorCtor,
		writable: true,
	});
	setGlobalValue("SyntaxError", syntaxErrorCtor);
	setGlobalValue("Text", window.Text);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

function clickButtonByPreset(preset: string) {
	const button = document.querySelector(
		`button[data-composer-ui-preset="${preset}"]`
	) as HTMLButtonElement | null;

	if (!button) {
		throw new Error(`Missing composer preset button: ${preset}`);
	}

	button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function toggleCheckbox(label: string, checked: boolean) {
	const input = document.querySelector(
		`input[aria-label="${label}"]`
	) as HTMLInputElement | null;

	if (!input) {
		throw new Error(`Missing checkbox input: ${label}`);
	}

	input.click();
	if (checked !== input.checked) {
		input.click();
	}
}

function changeSelectValue(label: string, value: string) {
	const select = document.querySelector(
		`select[aria-label="${label}"]`
	) as HTMLSelectElement | null;

	if (!select) {
		throw new Error(`Missing select input: ${label}`);
	}

	select.value = value;
	select.dispatchEvent(new window.Event("change", { bubbles: true }));
}

describe("ComposerUiTestPage", () => {
	beforeEach(() => {
		activeRoot = null;
		mountNode = null;
		windowInstance = new Window({
			url: "https://example.com/composer-ui-test",
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

	it("renders the route shell without requiring live inbox data", async () => {
		const routeModule = await import("./page");
		const html = renderToStaticMarkup(React.createElement(routeModule.default));

		expect(html).toContain("Composer UI Test");
		expect(html).toContain("Focused inbox shell for composer iteration");
		expect(html).toContain("default");
	});

	it("switches between prompt, question, review, and retry presets", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { ComposerUiTestPage } = await import("./composer-ui-test-page");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);

		await act(async () => {
			activeRoot?.render(<ComposerUiTestPage />);
		});

		await act(async () => {
			clickButtonByPreset("prompt");
		});
		expect(document.body.innerHTML).toContain("Clarification");
		expect(document.body.innerHTML).toContain("Clarify");

		await act(async () => {
			clickButtonByPreset("question");
		});
		expect(document.body.innerHTML).toContain(
			'data-clarification-slot="question-flow"'
		);
		expect(document.body.innerHTML).toContain(
			"When should customers expect a billing or plan change to take effect?"
		);

		await act(async () => {
			clickButtonByPreset("review");
		});
		expect(document.body.innerHTML).toContain("Review FAQ draft");
		expect(document.body.innerHTML).toContain(">Approve<");
		expect(document.body.innerHTML).toContain(">Skip<");

		await act(async () => {
			clickButtonByPreset("retry");
		});
		expect(document.body.innerHTML).toContain(
			"This clarification needs a retry"
		);
		expect(document.body.innerHTML).toContain("Retry AI");
	});

	it("lets advanced controls drive visibility, attachments, uploading, escalation, and AI pause", async () => {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");
		const { ComposerUiTestPage } = await import("./composer-ui-test-page");

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);

		await act(async () => {
			activeRoot?.render(<ComposerUiTestPage />);
		});

		await act(async () => {
			changeSelectValue("Composer visibility", "private");
		});
		expect(document.body.innerHTML).toContain("Write a private note...");

		await act(async () => {
			toggleCheckbox("Attachments", true);
		});
		expect(document.body.innerHTML).toContain("faq-notes.pdf");
		expect(document.body.innerHTML).toContain("pricing-changelog.png");

		await act(async () => {
			toggleCheckbox("Uploading", true);
		});
		expect(document.body.innerHTML).toContain("Uploading 40%");

		await act(async () => {
			toggleCheckbox("Escalation", true);
		});
		expect(document.body.innerHTML).toContain("Join the conversation");

		await act(async () => {
			toggleCheckbox("AI paused", true);
		});
		expect(document.body.innerHTML).toContain("AI answers paused");
	});
});
