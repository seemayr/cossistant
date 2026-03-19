"use client";

import { SidebarContainer } from "@/components/ui/layout/sidebars/container";
import { SidebarItem } from "@/components/ui/layout/sidebars/sidebar-item";
import { Separator } from "@/components/ui/separator";
import { FakeResizableSidebar } from "./fake-resizable-sidebar";
import FakeUserDropdown from "./fake-user-dropdown";

type FakeInboxNavigationSidebarProps = {
	open: boolean;
	activeView: "inbox" | "resolved" | "spam" | "archived";
	statusCounts: {
		open: number;
		resolved: number;
		spam: number;
		archived: number;
	};
};

export function FakeInboxNavigationSidebar({
	open,
	activeView,
	statusCounts,
}: FakeInboxNavigationSidebarProps) {
	return (
		<FakeResizableSidebar
			className="pointer-events-none"
			open={open}
			position="left"
		>
			<SidebarContainer
				footer={
					<>
						<SidebarItem href="/docs">Docs</SidebarItem>
						<SidebarItem href="/settings">Settings</SidebarItem>
						<Separator className="opacity-30" />
						<FakeUserDropdown
							user={{
								name: "Anthony Riera",
								email: "the.shadcn@example.com",
								image: "https://github.com/rieranthony.png",
							}}
							websiteSlug="example"
						/>
					</>
				}
			>
				<SidebarItem
					active={activeView === "inbox"}
					href="/"
					// iconName="conversation"
					rightItem={
						<span className="pr-1 text-primary/40 text-xs">
							{statusCounts.open}
						</span>
					}
				>
					Inbox
				</SidebarItem>
				<SidebarItem
					active={activeView === "resolved"}
					href="/resolved"
					// iconName="conversation-resolved"
				>
					Resolved
				</SidebarItem>
				<SidebarItem
					active={activeView === "spam"}
					href="/spam"
					// iconName="conversation-spam"
				>
					Spam
				</SidebarItem>
				<SidebarItem
					active={activeView === "archived"}
					href="/archived"
					// iconName="archive"
				>
					Archived
				</SidebarItem>
			</SidebarContainer>
		</FakeResizableSidebar>
	);
}
