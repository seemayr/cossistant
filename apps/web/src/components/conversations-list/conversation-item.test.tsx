import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("facehash", () => ({
	Facehash: ({ className }: { className?: string }) => (
		<div className={className}>facehash</div>
	),
}));

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({
		children,
		content,
	}: {
		children: React.ReactNode;
		content?: React.ReactNode;
	}) => (
		<div data-slot="mock-tooltip" data-tooltip-content={String(content ?? "")}>
			{children}
		</div>
	),
}));

const modulePromise = import("./conversation-item");

async function renderView(props: Record<string, unknown> = {}) {
	const { ConversationItemView } = await modulePromise;

	return renderToStaticMarkup(
		<ConversationItemView
			hasUnreadMessage={false}
			isTyping={false}
			lastTimelineContent={<span>Hello</span>}
			visitorName="Gorgeous Wolf"
			{...props}
		/>
	);
}

describe("ConversationItemView", () => {
	it("renders an avatar trigger when a detail handler is provided", async () => {
		const html = await renderView({
			onAvatarClick: () => {},
		});

		expect(html).toContain('data-slot="conversation-item-avatar-trigger"');
		expect(html).toContain("Click to get more details");
		expect(html).toContain("cursor-pointer");
		expect(html).toContain("hover:scale-105");
	});

	it("renders a plain avatar when no detail handler is provided", async () => {
		const html = await renderView();

		expect(html).not.toContain('data-slot="conversation-item-avatar-trigger"');
		expect(html).toContain('data-slot="avatar"');
	});
});
