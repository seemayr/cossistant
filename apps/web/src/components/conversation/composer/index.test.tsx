import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
}));

const composerModulePromise = import(".");

describe("Composer", () => {
	it("keeps the default center and frame unhighlighted when no custom slots are passed", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				value: "",
				onChange: () => {},
				onSubmit: () => {},
				placeholder: "Type your message...",
			})
		);

		expect(html).toContain("Type your message...");
		expect(html).toContain('data-composer-frame="default"');
		expect(html).toContain('data-composer-central-block="true"');
	});

	it("renders the shared visibility segmented control when visibility can change", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				onChange: () => {},
				onSubmit: () => {},
				onVisibilityChange: () => {},
				value: "",
				visibility: "private",
			})
		);

		expect(html).toContain('data-slot="segmented-control"');
		expect(html).toContain('aria-label="Message visibility"');
		expect(html).toContain("Reply");
		expect(html).toContain("Private note");
	});

	it("highlights the frame as soon as any custom slot is present", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				aboveBlock: React.createElement(
					"div",
					{ "data-clarification-slot": "true" },
					"Clarification prompt"
				),
				value: "",
				onChange: () => {},
				onSubmit: () => {},
			})
		);

		expect(html).toContain("Clarification prompt");
		expect(html).toContain('data-composer-frame="highlighted"');
	});

	it("renders a custom central block instead of the default center surface", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				centralBlock: React.createElement(
					"section",
					{ "data-central-slot": "true" },
					"Custom central block"
				),
				value: "",
				onChange: () => {},
				onSubmit: () => {},
				placeholder: "Type your message...",
			})
		);

		expect(html).toContain("Custom central block");
		expect(html).toContain('data-central-slot="true"');
		expect(html).toContain('data-composer-frame="highlighted"');
		expect(html).not.toContain("Type your message...");
	});

	it("renders a custom bottom block instead of the default footer", async () => {
		const { Composer } = await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Composer, {
				bottomBlock: React.createElement(
					"div",
					{ "data-bottom-slot": "true" },
					"Custom bottom block"
				),
				value: "",
				onChange: () => {},
				onSubmit: () => {},
			})
		);

		expect(html).toContain("Custom bottom block");
		expect(html).toContain('data-bottom-slot="true"');
		expect(html).toContain('data-composer-frame="highlighted"');
		expect(html).not.toContain('data-composer-bottom-block="true"');
	});

	it("exports reusable central and bottom shells for custom showcase layouts", async () => {
		const { ComposerBottomBlock, ComposerCentralBlock } =
			await composerModulePromise;

		const html = renderToStaticMarkup(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(
					ComposerCentralBlock,
					null,
					React.createElement("div", null, "Central shell")
				),
				React.createElement(
					ComposerBottomBlock,
					null,
					React.createElement("div", null, "Bottom shell")
				)
			)
		);

		expect(html).toContain('data-composer-central-block="true"');
		expect(html).toContain('data-composer-bottom-block="true"');
		expect(html).toContain("Central shell");
		expect(html).toContain("Bottom shell");
	});
});
