import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupportTextResolvedFormatter } from "../text/locales/keys";

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: string) => {
		switch (key) {
			case "component.message.timestamp.aiIndicator":
				return "AI";
			default:
				throw new Error(`Unexpected text key: ${key}`);
		}
	}) as SupportTextResolvedFormatter;
}

const useSupportTextMock = mock(() => createTextFormatter());

mock.module("../text", () => ({
	useSupportText: useSupportTextMock,
}));

const modulePromise = import("./timeline-message-item");

function createMessageItem({
	id,
	text,
	userId = null,
	visitorId = null,
	aiAgentId = null,
}: {
	id: string;
	text: string;
	userId?: string | null;
	visitorId?: string | null;
	aiAgentId?: string | null;
}): TimelineItem {
	return {
		id,
		conversationId: "conv-1",
		organizationId: "org-1",
		visibility: "public",
		type: "message",
		text,
		parts: [],
		userId,
		visitorId,
		aiAgentId,
		createdAt: "2026-04-13T10:00:00.000Z",
		deletedAt: null,
	};
}

async function renderMessageItem({
	item,
	isSentByViewer = false,
}: {
	item: TimelineItem;
	isSentByViewer?: boolean;
}): Promise<string> {
	const { TimelineMessageItem } = await modulePromise;

	return renderToStaticMarkup(
		<TimelineMessageItem isLast isSentByViewer={isSentByViewer} item={item} />
	);
}

describe("Support TimelineMessageItem code and command theming", () => {
	beforeEach(() => {
		useSupportTextMock.mockClear();
	});

	afterAll(() => {
		mock.restore();
	});

	it("keeps received fenced code blocks on their own neutral surface", async () => {
		const html = await renderMessageItem({
			item: createMessageItem({
				id: "support-message-code-received",
				text: [
					'```tsx title="app/page.tsx"',
					"export default function Page() {}",
					"```",
				].join("\n"),
				aiAgentId: "ai-1",
			}),
		});

		expect(html).toContain('data-co-code-block=""');
		expect(html).toContain("bg-co-background-200 text-co-foreground");
		expect(html).toContain(
			"no-scrollbar overflow-x-auto p-3 font-co-mono text-co-foreground text-xs leading-relaxed"
		);
		expect(html).toContain(
			'class="language-tsx font-co-mono text-co-foreground"'
		);
		expect(html).toContain("text-co-muted-foreground");
	});

	it("resets fenced code blocks even inside sent bubbles", async () => {
		const html = await renderMessageItem({
			item: createMessageItem({
				id: "support-message-code-sent",
				text: [
					'```tsx title="app/page.tsx"',
					"export default function Page() {}",
					"```",
				].join("\n"),
				visitorId: "visitor-1",
			}),
			isSentByViewer: true,
		});

		expect(html).toContain("bg-co-primary text-co-primary-foreground");
		expect(html).toContain('data-co-code-block=""');
		expect(html).toContain("bg-co-background-200 text-co-foreground");
		expect(html).toContain(
			'class="language-tsx font-co-mono text-co-foreground"'
		);
	});

	it("keeps promoted inline commands on the neutral block surface", async () => {
		const html = await renderMessageItem({
			item: createMessageItem({
				id: "support-message-command-sent",
				text: "Run `pnpm add @cossistant/react` in your terminal.",
				visitorId: "visitor-1",
			}),
			isSentByViewer: true,
		});

		expect(html).toContain("bg-co-primary text-co-primary-foreground");
		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain("bg-co-background-200 text-co-foreground");
		expect(html).toContain(
			"no-scrollbar overflow-x-auto p-3 font-co-mono text-co-foreground text-xs leading-relaxed"
		);
		expect(html).toContain(
			'class="language-bash font-co-mono text-co-foreground">npm install @cossistant/react</code>'
		);
	});
});
