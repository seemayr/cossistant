import { describe, expect, it } from "bun:test";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineMessageItem } from "./timeline-message-item";

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

function renderMessageItem({
	item,
	isSentByViewer = false,
}: {
	item: TimelineItem;
	isSentByViewer?: boolean;
}): string {
	return renderToStaticMarkup(
		<TimelineMessageItem isLast isSentByViewer={isSentByViewer} item={item} />
	);
}

describe("TimelineMessageItem code and command theming", () => {
	it("keeps received fenced code blocks on their own neutral surface", () => {
		const html = renderMessageItem({
			item: createMessageItem({
				id: "message-code-received",
				text: [
					'```tsx title="app/page.tsx"',
					"export default function Page() {}",
					"```",
				].join("\n"),
				visitorId: "visitor-1",
			}),
		});

		expect(html).toContain('data-co-code-block=""');
		expect(html).toContain("bg-background-400 text-foreground");
		expect(html).toContain(
			"no-scrollbar overflow-x-auto p-3 font-mono text-foreground text-xs leading-relaxed"
		);
		expect(html).toContain('class="language-tsx font-mono text-foreground"');
		expect(html).toContain("text-muted-foreground");
	});

	it("resets fenced code blocks even inside sent bubbles", () => {
		const html = renderMessageItem({
			item: createMessageItem({
				id: "message-code-sent",
				text: [
					'```tsx title="app/page.tsx"',
					"export default function Page() {}",
					"```",
				].join("\n"),
				userId: "user-1",
			}),
			isSentByViewer: true,
		});

		expect(html).toContain("bg-primary text-primary-foreground");
		expect(html).toContain('data-co-code-block=""');
		expect(html).toContain("bg-background-400 text-foreground");
		expect(html).toContain('class="language-tsx font-mono text-foreground"');
	});

	it("keeps promoted inline commands on the neutral block surface", () => {
		const html = renderMessageItem({
			item: createMessageItem({
				id: "message-command-sent",
				text: "Run `pnpm add @cossistant/react` in your terminal.",
				userId: "user-1",
			}),
			isSentByViewer: true,
		});

		expect(html).toContain("bg-primary text-primary-foreground");
		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain("bg-background-400 text-foreground");
		expect(html).toContain(
			"no-scrollbar overflow-x-auto p-3 font-mono text-foreground text-xs leading-relaxed"
		);
		expect(html).toContain(
			'class="language-bash font-mono text-foreground">npm install @cossistant/react</code>'
		);
	});
});
