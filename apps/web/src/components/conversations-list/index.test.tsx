import { describe, expect, it, mock } from "bun:test";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let isAnalyticsSheetOpen = false;
const renderedButtonHandlers: Array<() => void> = [];
const openLiveVisitorsOverlayCalls: string[] = [];

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

mock.module("@/hooks/use-live-visitors-overlay-state", () => ({
	useLiveVisitorsOverlayState: () => ({
		openLiveVisitorsOverlay: () => {
			openLiveVisitorsOverlayCalls.push("open");
			return Promise.resolve(new URLSearchParams());
		},
	}),
}));

mock.module("@/components/inbox-analytics", () => ({
	InboxAnalyticsDesktopHeaderActions: ({
		actionIconName,
		actionLabel,
	}: {
		actionIconName: string;
		actionLabel: string;
	}) => (
		<div
			data-action-icon={actionIconName}
			data-action-label={actionLabel}
			data-slot="mock-inbox-analytics-desktop-header-actions"
		>
			<div data-slot={`icon-${actionIconName}`} />
			<div data-slot="mock-inbox-analytics-range-control" />
		</div>
	),
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

mock.module("../ui/button", () => ({
	Button: ({
		asChild,
		children,
		onClick,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => {
		if (onClick) {
			renderedButtonHandlers.push(() => {
				onClick({
					preventDefault() {},
					stopPropagation() {},
				} as never);
			});
		}

		if (asChild) {
			return <>{children}</>;
		}

		return (
			<button {...props} type={props.type ?? "button"}>
				{children}
			</button>
		);
	},
}));

mock.module("../ui/icons", () => ({
	__esModule: true,
	default: ({ name }: { name: string }) => <span data-slot={`icon-${name}`} />,
}));

mock.module("../ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

mock.module("../ui/sheet", () => ({
	Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	SheetContent: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="mock-sheet-content">{children}</div>
	),
	SheetDescription: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SheetHeader: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SheetTitle: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SheetTrigger: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

mock.module("./ai-agent-onboarding", () => ({
	AIAgentOnboarding: () => null,
}));

mock.module("./virtualized-conversations", () => ({
	VirtualizedConversations: ({
		analyticsSlot,
	}: {
		analyticsSlot?: React.ReactNode;
	}) => <div data-slot="mock-virtualized-conversations">{analyticsSlot}</div>,
}));

async function renderList(
	selectedConversationStatus: "archived" | "resolved" | null,
	{
		tinybirdEnabled = true,
	}: {
		tinybirdEnabled?: boolean;
	} = {}
) {
	renderedButtonHandlers.length = 0;
	openLiveVisitorsOverlayCalls.length = 0;
	process.env.NEXT_PUBLIC_TINYBIRD_ENABLED = tinybirdEnabled ? "true" : "false";
	const { ConversationsList } = await import(`./index?${Math.random()}`);

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
		expect(html).toContain(
			'data-slot="mock-inbox-analytics-desktop-header-actions"'
		);
		expect(html).toContain('data-action-icon="globe"');
		expect(html).toContain('data-action-label="Open live visitors overlay"');
		expect(html).toContain('data-slot="mock-inbox-analytics-range-control"');
		expect(html).toContain('data-slot="icon-globe"');
		expect(html).toContain("hidden px-1 pt-2 lg:block");

		renderedButtonHandlers[0]?.();

		expect(openLiveVisitorsOverlayCalls).toEqual(["open"]);
	});

	it("hides analytics controls outside the inbox view", async () => {
		isAnalyticsSheetOpen = false;
		const html = await renderList("resolved");

		expect(html).not.toContain(">Analytics<");
		expect(html).not.toContain('data-slot="mock-inbox-analytics"');
	});

	it("hides analytics controls entirely when Tinybird is disabled", async () => {
		isAnalyticsSheetOpen = false;
		const html = await renderList(null, {
			tinybirdEnabled: false,
		});

		expect(html).not.toContain(">Analytics<");
		expect(html).not.toContain('data-slot="mock-inbox-analytics"');
		expect(html).not.toContain('data-slot="inbox-desktop-analytics-slot"');
		expect(html).not.toContain("Open live visitors overlay");
	});
});
