"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { SidebarUpgradeButton } from "@/components/plan/sidebar-upgrade-button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { NavigationDropdown } from "../../../../navigation-dropdown";
import { SidebarContainer } from "../container";
import { ResizableSidebar } from "../resizable-sidebar";
import { SidebarItem } from "../sidebar-item";

export function AgentsNavigationSidebar() {
	const website = useWebsite();
	const pathname = usePathname();
	const trpc = useTRPC();
	const basePath = `/${website.slug}/agent`;
	const trainingPath = `${basePath}/training`;

	// Fetch plan info for upgrade button
	const { data: planInfo } = useQuery({
		...trpc.plan.getPlanInfo.queryOptions({
			websiteSlug: website.slug,
		}),
	});

	// Check if current path matches
	const isGeneralActive =
		pathname === basePath &&
		!pathname.includes("/training") &&
		!pathname.includes("/behavior");
	const isBehaviorActive = pathname.startsWith(`${basePath}/behavior`);
	const isWebSourcesActive = pathname.startsWith(`${trainingPath}/web`);
	const isFaqActive = pathname.startsWith(`${trainingPath}/faq`);
	const isFilesActive = pathname.startsWith(`${trainingPath}/files`);
	const isToolsActive = pathname.startsWith(`${basePath}/tools`);
	const isSkillsActive = pathname.startsWith(`${basePath}/skills`);
	const isIntegrationsActive = pathname.startsWith(`${basePath}/integrations`);

	// Determine if sections should be open by default
	const isKnowledgeActive = isWebSourcesActive || isFaqActive || isFilesActive;
	const isCapabilitiesActive =
		isToolsActive || isSkillsActive || isIntegrationsActive;

	return (
		<ResizableSidebar position="left" sidebarTitle="AI Agent">
			<SidebarContainer
				footer={
					<>
						{planInfo && (
							<SidebarUpgradeButton
								planInfo={planInfo}
								websiteSlug={website.slug}
							/>
						)}
						<SidebarItem href="/docs">Docs</SidebarItem>
						<SidebarItem href={`/${website.slug}/settings`}>
							Settings
						</SidebarItem>
						<Separator className="opacity-30" />
						<NavigationDropdown websiteSlug={website.slug} />
					</>
				}
			>
				<div className="flex flex-col gap-1">
					<SidebarItem
						active={isGeneralActive}
						href={basePath}
						iconName="settings-2"
					>
						General
					</SidebarItem>
					<SidebarItem
						active={isBehaviorActive}
						href={`${basePath}/behavior`}
						iconName="target"
					>
						Behavior
					</SidebarItem>
				</div>

				{/* Knowledge Section - always open by default */}
				<SidebarItem
					defaultOpen={true}
					iconName="book-open"
					items={[
						{
							label: "Web Sources",
							href: `${trainingPath}/web`,
							active: isWebSourcesActive,
						},
						{
							label: "FAQ",
							href: `${trainingPath}/faq`,
							active: isFaqActive,
						},
						{
							label: "Files",
							href: `${trainingPath}/files`,
							active: isFilesActive,
						},
					]}
				>
					Knowledge
				</SidebarItem>

				{/* Capabilities Section */}
				<SidebarItem
					defaultOpen={isCapabilitiesActive}
					iconName="agent"
					items={[
						{
							label: "Tools",
							href: `${basePath}/tools`,
							active: isToolsActive,
						},
						{
							label: "Skills",
							href: `${basePath}/skills`,
							active: isSkillsActive,
						},
						{
							label: "Integrations",
							href: `${basePath}/integrations`,
							active: isIntegrationsActive,
							rightItem: (
								<Badge className="ml-auto" variant="secondary">
									Soon
								</Badge>
							),
						},
					]}
				>
					Capabilities
				</SidebarItem>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
