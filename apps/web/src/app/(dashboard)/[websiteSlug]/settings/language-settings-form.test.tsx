import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import type React from "react";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

const invalidateCalls: unknown[] = [];
const refreshCalls: number[] = [];
const toastSuccessCalls: string[] = [];
const toastErrorCalls: string[] = [];
const updateCalls: Array<{
	data: Record<string, unknown>;
	organizationId: string;
	websiteId: string;
}> = [];

mock.module("@tanstack/react-query", () => ({
	useMutation: (options: {
		onError?: (error: unknown) => void;
		onSuccess?: (updatedWebsite: {
			autoTranslateEnabled: boolean;
			defaultLanguage: string;
		}) => Promise<void> | void;
	}) => ({
		isPending: false,
		mutateAsync: async (input: {
			data: Record<string, unknown>;
			organizationId: string;
			websiteId: string;
		}) => {
			updateCalls.push(input);
			await options.onSuccess?.({
				autoTranslateEnabled:
					typeof input.data.autoTranslateEnabled === "boolean"
						? (input.data.autoTranslateEnabled as boolean)
						: true,
				defaultLanguage: String(input.data.defaultLanguage ?? "en"),
			});
		},
	}),
	useQueryClient: () => ({
		invalidateQueries: async (args: unknown) => {
			invalidateCalls.push(args);
		},
	}),
}));

mock.module("next/navigation", () => ({
	useRouter: () => ({
		refresh: () => {
			refreshCalls.push(Date.now());
		},
	}),
}));

mock.module("sonner", () => ({
	toast: {
		error: (message: string) => {
			toastErrorCalls.push(message);
		},
		success: (message: string) => {
			toastSuccessCalls.push(message);
		},
	},
}));

mock.module("@/components/plan/upgrade-modal", () => ({
	UpgradeModal: ({ open }: { open: boolean }) =>
		open ? <div data-slot="mock-upgrade-modal" /> : null,
}));

mock.module("@/components/ui/base-submit-button", () => ({
	BaseSubmitButton: ({
		children,
		isSubmitting,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		isSubmitting?: boolean;
	}) => (
		<button
			{...props}
			data-submitting={String(!!isSubmitting)}
			type={props.type ?? "button"}
		>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props} type={props.type ?? "button"}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/language-picker", () => ({
	LanguagePicker: ({
		disabled,
		id,
		onChange,
		value,
	}: {
		disabled?: boolean;
		id?: string;
		onChange: (value: string) => void;
		value: string;
	}) => (
		<select
			data-slot="mock-language-picker"
			disabled={disabled}
			id={id}
			onChange={(event) => onChange((event.target as HTMLSelectElement).value)}
			value={value}
		>
			<option value="en">English</option>
			<option value="fr">French</option>
			<option value="de">German</option>
			<option value="pt">Portuguese</option>
		</select>
	),
}));

mock.module("@/components/ui/layout/settings-layout", () => ({
	SettingsRowFooter: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
}));

mock.module("@/components/ui/switch", () => ({
	Switch: ({
		checked,
		disabled,
		id,
		onCheckedChange,
	}: {
		checked: boolean;
		disabled?: boolean;
		id?: string;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			data-slot="mock-switch"
			disabled={disabled}
			id={id}
			onChange={(event) =>
				onCheckedChange((event.target as HTMLInputElement).checked)
			}
			onClick={() => onCheckedChange(!checked)}
			type="checkbox"
		/>
	),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		website: {
			developerSettings: {
				queryKey: ({ slug }: { slug: string }) => [
					"website.developerSettings",
					slug,
				],
			},
			getBySlug: {
				queryKey: ({ slug }: { slug: string }) => ["website.getBySlug", slug],
			},
			listByOrganization: {
				queryKey: ({ organizationId }: { organizationId: string }) => [
					"website.listByOrganization",
					organizationId,
				],
			},
			update: {
				mutationOptions: <T,>(options: T) => options,
			},
		},
	}),
}));

const modulePromise = import("./language-settings-form");

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
	"HTMLInputElement",
	"HTMLSelectElement",
	"MouseEvent",
	"Node",
	"SyntaxError",
	"Text",
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
	setGlobalValue("HTMLInputElement", window.HTMLInputElement);
	setGlobalValue("HTMLSelectElement", window.HTMLSelectElement);
	setGlobalValue("MouseEvent", window.MouseEvent);
	setGlobalValue("Node", window.Node);
	setGlobalValue("SyntaxError", Error);
	setGlobalValue("Text", window.Text);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

async function renderForm(node: React.ReactNode) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(node);
	});
}

function resetCalls() {
	invalidateCalls.length = 0;
	refreshCalls.length = 0;
	toastSuccessCalls.length = 0;
	toastErrorCalls.length = 0;
	updateCalls.length = 0;
}

describe("LanguageSettingsForm", () => {
	beforeEach(() => {
		resetCalls();
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

	it("renders both controls and submits language plus toggle changes on supported plans", async () => {
		const { LanguageSettingsForm } = await modulePromise;
		const { act } = await import("react");

		await renderForm(
			<LanguageSettingsForm
				currentPlan={
					{
						displayName: "Pro",
						features: {
							"auto-translate": true,
						},
						name: "pro",
						price: 49,
					} as never
				}
				initialAutoTranslateEnabled={true}
				initialDefaultLanguage="en-US"
				organizationId="org_123"
				websiteId="site_123"
				websiteSlug="acme"
			/>
		);

		expect(document.body.textContent).toContain("Default language");
		expect(document.body.textContent).toContain("Enable auto-translate");

		const languageSelect = document.getElementById(
			"default-language"
		) as HTMLSelectElement | null;
		const toggle = document.getElementById(
			"enable-auto-translate"
		) as HTMLInputElement | null;
		const form = document.querySelector("form");

		expect(languageSelect?.value).toBe("en");
		expect(toggle?.checked).toBe(true);

		await act(async () => {
			if (languageSelect) {
				languageSelect.value = "fr";
				languageSelect.dispatchEvent(
					new window.Event("change", { bubbles: true })
				);
			}

			if (toggle) {
				toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
			}
		});

		await act(async () => {
			form?.dispatchEvent(
				new window.Event("submit", { bubbles: true, cancelable: true })
			);
			await Promise.resolve();
		});

		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0]).toEqual({
			data: {
				autoTranslateEnabled: false,
				defaultLanguage: "fr",
			},
			organizationId: "org_123",
			websiteId: "site_123",
		});
		expect(refreshCalls).toHaveLength(1);
		expect(toastSuccessCalls).toEqual(["Language settings updated."]);
	});

	it("keeps auto-translate locked but still saves language changes on unsupported plans", async () => {
		const { LanguageSettingsForm } = await modulePromise;
		const { act } = await import("react");

		await renderForm(
			<LanguageSettingsForm
				currentPlan={
					{
						displayName: "Free",
						features: {
							"auto-translate": false,
						},
						name: "free",
						price: 0,
					} as never
				}
				initialAutoTranslateEnabled={true}
				initialDefaultLanguage="pt-BR"
				organizationId="org_123"
				websiteId="site_123"
				websiteSlug="acme"
			/>
		);

		const languageSelect = document.getElementById(
			"default-language"
		) as HTMLSelectElement | null;
		const toggle = document.getElementById(
			"enable-auto-translate"
		) as HTMLInputElement | null;
		const form = document.querySelector("form");

		expect(languageSelect?.value).toBe("pt");
		expect(toggle?.disabled).toBe(true);
		expect(document.body.textContent).toContain("Upgrade to Pro");

		await act(async () => {
			if (languageSelect) {
				languageSelect.value = "de";
				languageSelect.dispatchEvent(
					new window.Event("change", { bubbles: true })
				);
			}
		});

		await act(async () => {
			form?.dispatchEvent(
				new window.Event("submit", { bubbles: true, cancelable: true })
			);
			await Promise.resolve();
		});

		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0]).toEqual({
			data: {
				defaultLanguage: "de",
			},
			organizationId: "org_123",
			websiteId: "site_123",
		});
	});
});
