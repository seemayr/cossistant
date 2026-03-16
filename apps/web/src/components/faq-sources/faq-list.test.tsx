import { beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let queryState: {
	data?: { items: Array<{ id: string }> };
	isLoading: boolean;
} = {
	data: { items: [] },
	isLoading: false,
};

mock.module("@tanstack/react-query", () => ({
	useQuery: () => queryState,
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		knowledge: {
			list: {
				queryOptions: () => ({}),
			},
		},
	}),
}));

mock.module("./faq-list-item", () => ({
	FaqListItem: ({ faq }: { faq: { id: string } }) => (
		<div data-slot="mock-faq-list-item">{faq.id}</div>
	),
}));

const modulePromise = import("./faq-list");

async function renderFaqList(props: Record<string, unknown> = {}) {
	const { FaqList } = await modulePromise;
	const mergedProps = {
		aiAgentId: "agent_123",
		onDeepen: () => {},
		onDelete: () => {},
		onEdit: () => {},
		onToggleIncluded: () => {},
		websiteSlug: "acme",
		...props,
	};

	return renderToStaticMarkup(<FaqList {...(mergedProps as any)} />);
}

describe("FaqList", () => {
	beforeEach(() => {
		queryState = {
			data: { items: [] },
			isLoading: false,
		};
	});

	it("renders the supplied empty state when there are no FAQs", async () => {
		const html = await renderFaqList({
			emptyState: <div data-slot="custom-empty-state">Add your first FAQ</div>,
		});

		expect(html).toContain('data-slot="custom-empty-state"');
		expect(html).not.toContain("No FAQs yet");
	});

	it("renders FAQ items when data exists", async () => {
		queryState = {
			data: { items: [{ id: "faq_1" }] },
			isLoading: false,
		};

		const html = await renderFaqList();

		expect(html).toContain('data-slot="mock-faq-list-item"');
		expect(html).toContain("faq_1");
	});
});
