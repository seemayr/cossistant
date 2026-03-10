import { describe, expect, it, mock } from "bun:test";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let isAnalyticsSheetOpen = false;

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

mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({ data: null }),
	useMutation: () => ({
		isPending: false,
		mutate: () => {},
		mutateAsync: async () => {},
	}),
	useQueryClient: () => ({}),
	useInfiniteQuery: () => ({ data: null }),
	useSuspenseQuery: () => ({ data: null }),
	QueryClient: class QueryClient {},
	QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	HydrationBoundary: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		aiAgent: { get: { queryOptions: () => ({}) } },
		plan: { getPlanInfo: { queryOptions: () => ({}) } },
	}),
}));

mock.module("@/contexts/inboxes", () => ({
	useInboxes: () => ({
		statusCounts: {
			open: 0,
			resolved: 0,
			spam: 0,
			archived: 0,
		},
	}),
	useOptionalInboxes: () => null,
}));

mock.module("@/components/inbox-analytics", () => ({
	InboxAnalyticsDisplay: ({
		layout = "inline",
		livePresence,
	}: {
		layout?: "inline" | "sheet";
		livePresence?: {
			count: number | null;
		};
	}) => (
		<div
			data-layout={layout}
			data-live-count={livePresence?.count ?? "none"}
			data-slot="mock-inbox-analytics"
		/>
	),
	InboxAnalyticsRangeControl: ({ className }: { className?: string }) => (
		<div className={className} data-slot="mock-inbox-analytics-range-control" />
	),
	useInboxAnalyticsController: () => ({
		data: null,
		isError: false,
		isLoading: false,
		isSheetOpen: isAnalyticsSheetOpen,
		livePresence: {
			count: 6,
			isFetching: true,
			isLoading: false,
		},
		rangeDays: 7,
		setIsSheetOpen: () => {},
		setRangeDays: () => {},
	}),
}));

mock.module("@/components/plan/upgrade-modal", () => ({
	UpgradeModal: () => null,
}));

mock.module("../ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

mock.module("./ai-agent-onboarding", () => ({
	AIAgentOnboarding: () => null,
}));

const modulePromise = import("./index");

async function renderList(
	selectedConversationStatus: "archived" | "resolved" | null
) {
	const { ConversationsList } = await modulePromise;

	return renderToStaticMarkup(
		<ConversationsList
			basePath="/dashboard/inbox"
			conversations={[]}
			isLeftSidebarOpen
			onToggleLeftSidebar={() => {}}
			selectedConversationStatus={selectedConversationStatus}
			websiteSlug="acme"
		/>
	);
}

describe("ConversationsList analytics controls", () => {
	it("renders the mobile analytics trigger and desktop analytics slot for inbox", async () => {
		isAnalyticsSheetOpen = false;
		const html = await renderList(null);

		expect(html).toContain(">Analytics<");
		expect(html).toContain("lg:hidden");
		expect(html).toContain('data-slot="inbox-desktop-analytics-slot"');
		expect(html).toContain('data-slot="mock-inbox-analytics"');
		expect(html).toContain('data-live-count="6"');
		expect(html).toContain('data-slot="mock-inbox-analytics-range-control"');
		expect(html).toContain("hidden px-1 pt-2 lg:block");
		expect(html).toContain("hidden lg:flex");
	});

	it("hides analytics controls outside the inbox view", async () => {
		isAnalyticsSheetOpen = false;
		const html = await renderList("resolved");

		expect(html).not.toContain(">Analytics<");
		expect(html).not.toContain('data-slot="mock-inbox-analytics"');
	});
});
