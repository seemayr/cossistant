"use client";

import Link from "next/link";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

type DocsPageNode = {
	name?: React.ReactNode;
	type: "page";
	url: string;
};

type DocsTreeNode = {
	$id?: string;
	children?: DocsTreeNode[];
	name?: React.ReactNode;
	type: string;
	url?: string;
};

type DocsPageTree = {
	children: DocsTreeNode[];
};

type DocsNavTreeProps = {
	pathname: string;
	tree: DocsPageTree;
	wrapLink?: (props: {
		element: React.ReactElement;
		href: string;
		isActive: boolean;
		name?: React.ReactNode;
	}) => React.ReactElement;
};

function isFolderNode(node: DocsTreeNode): node is DocsTreeNode & {
	children: DocsTreeNode[];
	type: "folder";
} {
	return node.type === "folder" && Array.isArray(node.children);
}

function isPageNode(node: DocsTreeNode): node is DocsPageNode {
	return node.type === "page" && typeof node.url === "string";
}

export function DocsNavTree({ pathname, tree, wrapLink }: DocsNavTreeProps) {
	return (
		<div data-slot="docs-nav-tree">
			{tree.children.map((item, index) => (
				<SidebarGroup key={item.$id ?? `${item.type}-${index}`}>
					<SidebarGroupLabel className="font-medium text-muted-foreground">
						{item.name}
					</SidebarGroupLabel>
					<SidebarGroupContent>
						{isFolderNode(item) ? (
							<SidebarMenu className="gap-0.5">
								{item.children.map((subItem) => {
									if (!isPageNode(subItem)) {
										return null;
									}

									const isActive = subItem.url === pathname;
									const button = (
										<SidebarMenuButton
											aria-current={isActive ? "page" : undefined}
											asChild
											className="after:-inset-y-1 relative h-[30px] 3xl:fixed:w-full w-full 3xl:fixed:max-w-48 overflow-visible border border-transparent font-medium text-[0.8rem] after:absolute after:inset-x-0 after:z-0 after:rounded data-[active=true]:border-transparent data-[active=true]:bg-background-300"
											data-docs-url={subItem.url}
											data-slot="docs-nav-link"
											isActive={isActive}
										>
											<Link href={subItem.url}>{subItem.name}</Link>
										</SidebarMenuButton>
									);

									return (
										<SidebarMenuItem key={subItem.url}>
											{wrapLink
												? wrapLink({
														element: button,
														href: subItem.url,
														isActive,
														name: subItem.name,
													})
												: button}
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						) : null}
					</SidebarGroupContent>
				</SidebarGroup>
			))}
		</div>
	);
}

export type { DocsPageTree };
