"use client";

import { usePathname } from "next/navigation";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { DocsNavTree, type DocsPageTree } from "./docs-nav-tree";

export function DocsSidebar({
	tree,
	...props
}: React.ComponentProps<typeof Sidebar> & { tree: DocsPageTree }) {
	const pathname = usePathname();

	return (
		<Sidebar
			className="sticky top-[calc(var(--header-height)+1px)] z-30 hidden h-[calc(100svh-var(--header-height)-var(--footer-height))] bg-transparent lg:flex"
			collapsible="none"
			{...props}
		>
			<SidebarContent className="no-scrollbar px-0 pb-12">
				<div className="h-(--top-spacing) shrink-0" />
				<DocsNavTree pathname={pathname} tree={tree} />
			</SidebarContent>
		</Sidebar>
	);
}
