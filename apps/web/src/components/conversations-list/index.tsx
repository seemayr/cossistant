"use client";

import type { ConversationStatus } from "@cossistant/types";
import { useQuery } from "@tanstack/react-query";
import { Facehash } from "facehash";
import Link from "next/link";
import { InboxAnalytics } from "@/components/inbox-analytics";
import { type ConversationHeader, useInboxes } from "@/contexts/inboxes";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "../ui/button";
import Icon from "../ui/icons";
import { Page, PageContent, PageHeader, PageHeaderTitle } from "../ui/layout";
import { TextEffect } from "../ui/text-effect";
import { TooltipOnHover } from "../ui/tooltip";
import { AIAgentOnboarding } from "./ai-agent-onboarding";
import type { VirtualListItem } from "./types";
import { VirtualizedConversations } from "./virtualized-conversations";

type Props = {
	basePath: string;
	selectedConversationStatus: ConversationStatus | "archived" | null;
	conversations: ConversationHeader[];
	websiteSlug: string;
	isLeftSidebarOpen: boolean;
	onToggleLeftSidebar: () => void;
	smartItems?: VirtualListItem[] | null;
};

export function ConversationsList({
	basePath,
	selectedConversationStatus,
	conversations,
	websiteSlug,
	isLeftSidebarOpen,
	onToggleLeftSidebar,
	smartItems,
}: Props) {
	const trpc = useTRPC();
	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({ websiteSlug })
	);
	const { statusCounts } = useInboxes();

	const totalConversations =
		statusCounts.open +
		statusCounts.resolved +
		statusCounts.spam +
		statusCounts.archived;
	const isOnboarding = totalConversations === 0;

	const showWaitingForReplyPill = selectedConversationStatus === null;
	const showAnalytics =
		selectedConversationStatus === null && websiteSlug === "cossistant";
	const analyticsItems =
		showAnalytics && smartItems
			? [{ type: "analytics" as const }, ...smartItems]
			: smartItems;

	return (
		<Page className="px-0">
			<PageHeader className="flex items-center justify-between bg-transparent px-4 pl-5 dark:bg-transparent">
				<div className="flex items-center gap-2">
					{!isLeftSidebarOpen && (
						<TooltipOnHover
							align="end"
							content="Click to open sidebar"
							shortcuts={["["]}
						>
							<Button
								className="-ml-1"
								onClick={onToggleLeftSidebar}
								size="icon-small"
								variant="ghost"
							>
								<Icon filledOnHover name="sidebar-collapse" />
							</Button>
						</TooltipOnHover>
					)}
					<PageHeaderTitle className="capitalize">
						{selectedConversationStatus || "Inbox"}
					</PageHeaderTitle>
				</div>
			</PageHeader>
			{conversations.length === 0 ? (
				<PageContent className={showAnalytics ? "gap-6" : undefined}>
					{showAnalytics ? (
						<div className="px-1">
							<InboxAnalytics websiteSlug={websiteSlug} />
						</div>
					) : null}
					{isOnboarding ? (
						<div className="mx-1 mt-4 flex h-2/3 flex-col items-center justify-center gap-6">
							<Facehash
								className="rounded-lg border border-primary/60 border-dashed font-bold font-mono text-primary"
								colorClasses={["bg-background-100"]}
								enableBlink
								name={selectedConversationStatus ?? "I"}
								size={80}
								variant="solid"
							/>
							<p className="mt-10 text-primary text-xl">
								Welcome to your inbox
							</p>
							{aiAgent === null && (
								<AIAgentOnboarding websiteSlug={websiteSlug} />
							)}
							<div className="flex items-center justify-center gap-2">
								<Button asChild size="xs" variant="ghost">
									<Link href="/docs/quickstart">Read our setup guide</Link>
								</Button>
								<Button asChild size="xs" variant="ghost">
									<Link href="/docs/concepts">What are visitors?</Link>
								</Button>
								<Button asChild size="xs" variant="ghost">
									<Link href="/docs/concepts/conversations">
										Learn about conversations
									</Link>
								</Button>
							</div>
						</div>
					) : (
						<div className="mx-1 mt-4 flex h-2/3 flex-col items-center justify-center gap-6">
							<Facehash
								className="rounded-lg border border-primary/20 border-dashed font-bold font-mono text-primary/60"
								colorClasses={["bg-background-100"]}
								enableBlink
								name={selectedConversationStatus ?? "I"}
								size={80}
								variant="solid"
							/>
							<p className="text-base text-primary/60">
								No {selectedConversationStatus || ""} conversations
							</p>
						</div>
					)}
				</PageContent>
			) : (
				<VirtualizedConversations
					analyticsSlot={
						showAnalytics ? <InboxAnalytics websiteSlug={websiteSlug} /> : null
					}
					basePath={basePath}
					conversations={conversations}
					showWaitingForReplyPill={showWaitingForReplyPill}
					smartItems={analyticsItems}
					websiteSlug={websiteSlug}
				/>
			)}
		</Page>
	);
}
