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
	useReducedMotion: () => false,
}));

mock.module("../ui/layout/sidebars/visitor/visitor-sidebar", () => ({
	VisitorSidebar: () => <div data-visitor-sidebar="true" />,
}));

mock.module("./composer/limit-action", () => ({
	LimitAction: () => <div data-limit-action="true">Limit action</div>,
}));

mock.module("./header", () => ({
	ConversationHeader: () => <div data-conversation-header="true" />,
}));

mock.module("./messages/conversation-timeline", () => ({
	ConversationTimelineList: ({ inputHeight }: { inputHeight: number }) => (
		<div data-input-height={inputHeight}>Timeline</div>
	),
}));

const modulePromise = import(".");

describe("Conversation", () => {
	it("renders the composer instead of the limit action when escalation is active", async () => {
		const { Conversation } = await modulePromise;

		const html = renderToStaticMarkup(
			React.createElement(Conversation, {
				header: {} as never,
				input: {
					escalationAction: {
						onJoin: () => {},
						reason: "Needs a human response",
					},
					onChange: () => {},
					onSubmit: () => {},
					value: "",
				},
				limitAction: {
					limit: 10,
					onUpgradeClick: () => {},
					used: 10,
					windowDays: 30,
				},
				timeline: {} as never,
				visitorSidebar: {} as never,
			})
		);

		expect(html).toContain("Join the conversation");
		expect(html).toContain("Needs a human response");
		expect(html).not.toContain('data-limit-action="true"');
	});
});
