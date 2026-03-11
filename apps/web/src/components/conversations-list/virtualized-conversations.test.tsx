import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let isMobile = false;

mock.module("@tanstack/react-virtual", () => ({
	useVirtualizer: ({
		count,
		estimateSize,
		getItemKey,
	}: {
		count: number;
		estimateSize: (index: number) => number;
		getItemKey: (index: number) => string | number;
	}) => {
		const items: Array<{
			index: number;
			key: string | number;
			size: number;
			start: number;
		}> = [];
		let start = 0;

		for (let index = 0; index < count; index++) {
			const size = estimateSize(index);
			items.push({
				index,
				key: getItemKey(index),
				size,
				start,
			});
			start += size + 4;
		}

		return {
			getTotalSize: () => (count === 0 ? 0 : start - 4),
			getVirtualItems: () => items,
			measure: () => {},
		};
	},
}));

mock.module("@/hooks/use-mobile", () => ({
	useIsMobile: () => isMobile,
}));

mock.module("@/components/conversations-list/conversation-item", () => ({
	ConversationItem: ({ header }: { header: { id: string } }) => (
		<div data-slot="conversation-item">{header.id}</div>
	),
}));

mock.module("./use-conversation-keyboard-navigation", () => ({
	useConversationKeyboardNavigation: () => ({
		focusedConversationId: "conv-1",
		handleMouseEnter: () => {},
	}),
}));

const modulePromise = import("./virtualized-conversations");

async function renderVirtualizedList() {
	const { VirtualizedConversations } = await modulePromise;

	return renderToStaticMarkup(
		<VirtualizedConversations
			analyticsSlot={<div>analytics-slot</div>}
			basePath="/dashboard/inbox"
			conversations={[{ id: "conv-1" } as any]}
			showWaitingForReplyPill
			smartItems={[
				{ type: "analytics" },
				{
					type: "conversation",
					category: "other",
					conversation: { id: "conv-1" } as any,
				},
			]}
			websiteSlug="acme"
		/>
	);
}

describe("VirtualizedConversations analytics height", () => {
	it("keeps the desktop analytics slot height", async () => {
		isMobile = false;

		const html = await renderVirtualizedList();

		expect(html).toContain("analytics-slot");
		expect(html).toContain('data-slot="conversation-list-content"');
		expect(html).toContain("padding-bottom:240px");
		expect(html).toContain("height:128px");
	});

	it("collapses the analytics slot on mobile", async () => {
		isMobile = true;

		const html = await renderVirtualizedList();

		expect(html).toContain("analytics-slot");
		expect(html).toContain("padding-bottom:240px");
		expect(html).toContain("height:52px");
	});
});
