"use client";

import { usePathname } from "next/navigation";
import { SheetClose } from "@/components/ui/sheet";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DocsNavTree, type DocsPageTree } from "../docs/docs-nav-tree";

function isDocsPath(pathname: string) {
	return pathname === "/docs" || pathname.startsWith("/docs/");
}

export function DocsMobileNavigation({ tree }: { tree: DocsPageTree }) {
	const pathname = usePathname();

	if (!isDocsPath(pathname)) {
		return null;
	}

	return (
		<div
			className="mt-6 border-t border-dashed pt-6"
			data-slot="docs-mobile-navigation"
		>
			<div className="px-2">
				<h2 className="font-medium text-sm">Documentation</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Jump to another docs page.
				</p>
			</div>
			<div className="mt-4 pr-1">
				<SidebarProvider className="!min-h-0">
					<DocsNavTree
						pathname={pathname}
						tree={tree}
						wrapLink={({ element }) => (
							<SheetClose asChild>{element}</SheetClose>
						)}
					/>
				</SidebarProvider>
			</div>
		</div>
	);
}
