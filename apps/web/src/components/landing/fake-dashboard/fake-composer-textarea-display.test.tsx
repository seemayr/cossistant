import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FakeComposerTextareaDisplay } from "./fake-composer-textarea-display";

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
		span: ({
			children,
			animate: _animate,
			exit: _exit,
			initial: _initial,
			layout: _layout,
			transition: _transition,
			...props
		}: React.HTMLAttributes<HTMLSpanElement> &
			Record<string, unknown> & { children: React.ReactNode }) => (
			<span {...props}>{children}</span>
		),
	},
	useReducedMotion: () => false,
}));

describe("FakeComposerTextareaDisplay", () => {
	it("renders a placeholder state when there is no value", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeComposerTextareaDisplay
					placeholder="Type your message..."
					value=""
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-fake-textarea-display="true"');
		expect(html).toContain('data-fake-textarea-display-state="placeholder"');
		expect(html).toContain("Type your message...");
		expect(html).not.toContain('data-text-effect-caret="true"');
	});

	it("renders a typing state with the fake caret", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeComposerTextareaDisplay
					isTyping={true}
					placeholder="Type your message..."
					value="I joined and deployed the allowlist patch to production."
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-fake-textarea-display-state="typing"');
		expect(html).toContain('data-text-effect-caret="true"');
	});

	it("renders a static value state without the typing caret", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeComposerTextareaDisplay
					placeholder="Type your message..."
					value="Static reply"
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-fake-textarea-display-state="value"');
		expect(html).toContain("Static reply");
		expect(html).not.toContain('data-text-effect-caret="true"');
	});
});
