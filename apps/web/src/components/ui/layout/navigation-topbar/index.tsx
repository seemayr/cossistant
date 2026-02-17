"use client";

import { Support } from "@cossistant/next/support";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { ChangelogNotification } from "@/components/changelog-notification";
import { DashboardTriggerContent } from "@/components/support/custom-trigger";
import { useWebsite } from "@/contexts/website";
import type { LatestRelease } from "@/lib/latest-release";
import { useTRPC } from "@/lib/trpc/client";
import Icon from "../../icons";
import { Logo } from "../../logo";
import { TooltipOnHover } from "../../tooltip";
import { TopbarItem } from "./topbar-item";

type NavigationTopbarProps = {
	latestRelease?: LatestRelease | null;
	changelogContent?: React.ReactNode;
};

export function NavigationTopbar({
	latestRelease,
	changelogContent,
}: NavigationTopbarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const website = useWebsite();
	const trpc = useTRPC();

	// Data is pre-fetched in the layout, so it will be available immediately
	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website?.slug ?? "",
		})
	);

	// Check if agent exists and onboarding is complete
	const hasAgent = !!aiAgent?.onboardingCompletedAt;

	const baseInboxPath = `/${website?.slug}/inbox`;
	const isOnInboxView = pathname.startsWith(baseInboxPath);

	useHotkeys("escape", () => router.push(baseInboxPath), {
		enabled: !isOnInboxView,
		preventDefault: true,
		enableOnContentEditable: false,
		enableOnFormTags: false,
	});

	return (
		<header className="flex h-16 min-h-16 w-full items-center justify-between gap-4 pr-5 pl-6.5">
			<div className="flex flex-1 items-center gap-3">
				<AnimatePresence mode="wait">
					{isOnInboxView ? (
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.8 }}
							initial={{ opacity: 0, scale: 0.8 }}
							key="logo"
							transition={{ duration: 0.1 }}
						>
							<Link className="mr-2 block" href={baseInboxPath}>
								<Logo className="size-5.5 text-primary" />
							</Link>
						</motion.div>
					) : (
						<TooltipOnHover
							content="Back to Inbox"
							shortcuts={["Esc"]}
							side="right"
						>
							<motion.div
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.8 }}
								initial={{ opacity: 0, scale: 0.8 }}
								key="arrow"
								transition={{ duration: 0.1 }}
							>
								<Link
									className="mr-2 flex size-5.5 items-center justify-center rounded-md hover:bg-background-200"
									href={baseInboxPath}
								>
									<Icon className="size-4 text-primary" name="arrow-left" />
								</Link>
							</motion.div>
						</TooltipOnHover>
					)}
				</AnimatePresence>
				{latestRelease && (
					<ChangelogNotification
						date={latestRelease.date}
						description={latestRelease.description}
						tinyExcerpt={latestRelease.tinyExcerpt}
						version={latestRelease.version}
					>
						{changelogContent}
					</ChangelogNotification>
				)}
			</div>
			<div className="flex items-center gap-2">
				<TopbarItem
					active={pathname.startsWith(`/${website?.slug}/agent`)}
					className="pr-1"
					hideLabelOnMobile
					href={
						hasAgent
							? `/${website?.slug}/agent`
							: `/${website?.slug}/agent/create`
					}
				>
					{hasAgent ? (
						<span className="flex items-center gap-1.5">Agent</span>
					) : (
						<span className="flex items-center gap-1.5">
							New agent
							<span className="rounded-sm bg-cossistant-orange px-1.5 py-0.5 font-medium text-[10px] text-white leading-none">
								AI
							</span>
						</span>
					)}
				</TopbarItem>
				<TopbarItem
					active={pathname.startsWith(`/${website?.slug}/contacts`)}
					hideLabelOnMobile
					href={`/${website?.slug}/contacts`}
				>
					Contacts
				</TopbarItem>
				<Support side="bottom" sideOffset={8}>
					<Support.Trigger className="group/btn relative flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-primary/80 text-sm transition-colors hover:bg-background-300 hover:text-primary">
						{(props) => <DashboardTriggerContent {...props} />}
					</Support.Trigger>
				</Support>
			</div>
		</header>
	);
}
