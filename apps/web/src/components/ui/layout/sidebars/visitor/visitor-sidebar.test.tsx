import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const openVisitorDetailCalls: string[] = [];

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

mock.module("@/hooks/use-contact-visitor-detail-state", () => ({
	useContactVisitorDetailState: () => ({
		openVisitorDetail: (visitorId: string) => {
			openVisitorDetailCalls.push(visitorId);
			return Promise.resolve([]);
		},
	}),
}));

mock.module(
	"@/components/conversation/actions/use-conversation-action-runner",
	() => ({
		useConversationActionRunner: () => ({
			unblockVisitor: async () => {},
			pendingAction: {
				unblockVisitor: false,
			},
			runAction: async (action: () => Promise<unknown>) => action(),
		}),
	})
);

mock.module("./hooks", () => ({
	useVisitorData: () => ({
		fullName: "Gorgeous Wolf",
		presence: null,
		countryDetails: { code: "TH" },
		countryLabel: "Thailand",
		localTime: { time: "2:00 PM", offset: "+07:00" },
		timezoneTooltip: "Timezone: Asia/Bangkok",
	}),
}));

mock.module("./visitor-sidebar-header", () => ({
	VisitorSidebarHeader: ({ onOpenDetail }: { onOpenDetail?: () => void }) => {
		onOpenDetail?.();
		return <div data-slot="mock-visitor-sidebar-header" />;
	},
}));

mock.module("../container", () => ({
	SidebarContainer: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

mock.module("../resizable-sidebar", () => ({
	ResizableSidebar: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

mock.module("../shared", () => ({
	ValueDisplay: () => null,
	ValueGroup: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

mock.module("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

const modulePromise = import("./visitor-sidebar");

describe("VisitorSidebar", () => {
	it("opens the visitor detail page with visitorId from the sidebar header", async () => {
		openVisitorDetailCalls.length = 0;
		const { VisitorSidebar } = await modulePromise;

		const html = renderToStaticMarkup(
			<VisitorSidebar
				conversationId="conversation-1"
				isLoading={false}
				visitor={{
					id: "visitor-1",
					browser: "Chrome",
					browserVersion: "134.0",
					os: "macOS",
					osVersion: "15.0",
					device: "MacBook Pro",
					deviceType: "desktop",
					ip: "127.0.0.1",
					city: "Bangkok",
					region: "Bangkok",
					country: "Thailand",
					countryCode: "TH",
					latitude: 13.7563,
					longitude: 100.5018,
					language: "en-US",
					timezone: "Asia/Bangkok",
					screenResolution: "1728x1117",
					viewport: "1440x900",
					createdAt: "2026-01-10T10:00:00.000Z",
					updatedAt: "2026-03-01T09:30:00.000Z",
					lastSeenAt: "2026-03-05T14:45:00.000Z",
					websiteId: "website-1",
					organizationId: "organization-1",
					blockedAt: null,
					blockedByUserId: null,
					isBlocked: false,
					contact: {
						id: "contact-1",
						externalId: "crm_123",
						name: "Gorgeous Wolf",
						email: "wolf@example.com",
						image: "https://example.com/wolf.png",
						metadata: null,
						contactOrganizationId: null,
						websiteId: "website-1",
						organizationId: "organization-1",
						userId: null,
						createdAt: "2026-01-10T10:00:00.000Z",
						updatedAt: "2026-03-01T09:30:00.000Z",
					},
				}}
				visitorId="visitor-1"
			/>
		);

		expect(html).toContain('data-slot="mock-visitor-sidebar-header"');
		expect(openVisitorDetailCalls).toEqual(["visitor-1"]);
	});
});
