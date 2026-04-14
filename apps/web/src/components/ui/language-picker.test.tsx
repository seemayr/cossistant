import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

const PopoverContext = React.createContext<{
	onOpenChange?: (open: boolean) => void;
	open: boolean;
}>({
	open: false,
});

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

mock.module("@/components/ui/popover", () => ({
	Popover: ({
		children,
		onOpenChange,
		open = false,
	}: {
		children: React.ReactNode;
		onOpenChange?: (open: boolean) => void;
		open?: boolean;
	}) => (
		<PopoverContext.Provider value={{ onOpenChange, open }}>
			{children}
		</PopoverContext.Provider>
	),
	PopoverTrigger: ({
		children,
	}: {
		children: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
	}) => {
		const context = React.useContext(PopoverContext);

		return React.cloneElement(children, {
			onClick: (event) => {
				children.props.onClick?.(event);
				context.onOpenChange?.(!context.open);
			},
		});
	},
	PopoverContent: ({
		children,
		...props
	}: React.HTMLAttributes<HTMLDivElement>) => {
		const context = React.useContext(PopoverContext);

		if (!context.open) {
			return null;
		}

		return (
			<div {...props} data-slot="mock-popover-content">
				{children}
			</div>
		);
	},
}));

mock.module("@/components/ui/command", () => ({
	Command: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="mock-command">{children}</div>
	),
	CommandEmpty: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="mock-command-empty">{children}</div>
	),
	CommandGroup: ({
		children,
		heading,
	}: {
		children: React.ReactNode;
		heading?: React.ReactNode;
	}) => (
		<div data-slot="mock-command-group">
			{heading ? (
				<div data-slot="mock-command-group-heading">{heading}</div>
			) : null}
			{children}
		</div>
	),
	CommandInput: ({
		onValueChange,
		value,
		...props
	}: React.InputHTMLAttributes<HTMLInputElement> & {
		onValueChange?: (value: string) => void;
	}) => (
		<input
			{...props}
			onInput={(event) =>
				onValueChange?.((event.target as HTMLInputElement).value)
			}
			value={value}
		/>
	),
	CommandItem: ({
		children,
		onSelect,
		value,
	}: {
		children: React.ReactNode;
		onSelect?: (value: string) => void;
		value?: string;
	}) => (
		<button
			data-slot="mock-command-item"
			data-value={value}
			onClick={() => onSelect?.(value ?? "")}
			type="button"
		>
			{children}
		</button>
	),
	CommandList: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="mock-command-list">{children}</div>
	),
}));

const modulePromise = import("./language-picker");

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

async function renderPicker(node: React.ReactNode) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(node);
	});
}

describe("LanguagePicker", () => {
	beforeEach(() => {
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

	it("renders the selected label for locale-specific values", async () => {
		const { LanguagePicker } = await modulePromise;

		await renderPicker(<LanguagePicker onChange={() => {}} value="en-US" />);

		const trigger = document.querySelector(
			'[data-slot="language-picker-trigger"]'
		);

		expect(trigger?.textContent).toContain("English");
	});

	it("shows popular languages first when opened", async () => {
		const { LanguagePicker } = await modulePromise;
		const { act } = await import("react");

		await renderPicker(<LanguagePicker onChange={() => {}} value="en" />);

		const trigger = document.querySelector(
			'[data-slot="language-picker-trigger"]'
		);

		await act(async () => {
			trigger?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		});

		const items = Array.from(
			document.querySelectorAll('[data-slot="mock-command-item"]')
		)
			.slice(0, 5)
			.map((element) => element.textContent?.replace(/\s+/g, " ").trim());

		expect(items).toEqual([
			"Englishen",
			"Spanishes",
			"Frenchfr",
			"Germande",
			"Portuguesept",
		]);
	});

	it("filters by language label and code", async () => {
		const { LanguagePicker } = await modulePromise;
		const { act } = await import("react");

		await renderPicker(<LanguagePicker onChange={() => {}} value="en" />);

		const trigger = document.querySelector(
			'[data-slot="language-picker-trigger"]'
		);

		await act(async () => {
			trigger?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		});

		const searchInput = document.querySelector(
			'input[placeholder="Search languages..."]'
		) as HTMLInputElement | null;

		await act(async () => {
			if (searchInput) {
				searchInput.value = "port";
				searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
			}
		});

		expect(document.body.textContent).toContain("Portuguese");
		expect(document.body.textContent).not.toContain("German de");

		await act(async () => {
			if (searchInput) {
				searchInput.value = "zh";
				searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
			}
		});

		expect(document.body.textContent).toContain("Chinese");
	});

	it("shows an empty state when no languages match the search", async () => {
		const { LanguagePicker } = await modulePromise;
		const { act } = await import("react");

		await renderPicker(<LanguagePicker onChange={() => {}} value="en" />);

		const trigger = document.querySelector(
			'[data-slot="language-picker-trigger"]'
		);

		await act(async () => {
			trigger?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		});

		const searchInput = document.querySelector(
			'input[placeholder="Search languages..."]'
		) as HTMLInputElement | null;

		await act(async () => {
			if (searchInput) {
				searchInput.value = "zzz";
				searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
			}
		});

		expect(document.body.textContent).toContain("No language found.");
	});

	it("closes after selection and notifies the parent", async () => {
		const { LanguagePicker } = await modulePromise;
		const { act } = await import("react");
		const onChangeCalls: string[] = [];

		function Harness() {
			const [value, setValue] = React.useState("en");

			return (
				<LanguagePicker
					onChange={(nextValue) => {
						onChangeCalls.push(nextValue);
						setValue(nextValue);
					}}
					value={value}
				/>
			);
		}

		await renderPicker(<Harness />);

		const trigger = document.querySelector(
			'[data-slot="language-picker-trigger"]'
		);

		await act(async () => {
			trigger?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		});

		const spanishOption = Array.from(
			document.querySelectorAll('[data-slot="mock-command-item"]')
		).find((element) => element.textContent?.includes("Spanish"));

		await act(async () => {
			spanishOption?.dispatchEvent(
				new window.MouseEvent("click", { bubbles: true })
			);
		});

		expect(onChangeCalls).toEqual(["es"]);
		expect(
			document.querySelector('[data-slot="mock-popover-content"]')
		).toBeNull();
		expect(trigger?.textContent).toContain("Spanish");
	});
});
