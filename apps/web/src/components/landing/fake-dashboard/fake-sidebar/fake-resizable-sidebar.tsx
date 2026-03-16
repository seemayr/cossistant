"use client";

import type { ReactNode } from "react";
import {
	DEFAULT_SIDEBAR_WIDTH,
	type SidebarPosition,
} from "@/hooks/use-sidebars";
import { cn } from "@/lib/utils";

type ResizableSidebarProps = {
	className?: string;
	children: ReactNode;
	position: SidebarPosition;
	open: boolean;
};

export const FakeResizableSidebar = ({
	className,
	children,
	position,
	open,
}: ResizableSidebarProps) => (
	<aside
		className={cn(
			"relative flex p-0 transition-all duration-200 ease-in-out",
			className,
			{
				"ml-0 p-0": !open,
				"border-r": position === "left",
				"border-l": position === "right",
				"border-transparent": !open,
			}
		)}
		style={{
			width: open ? DEFAULT_SIDEBAR_WIDTH : 0,
		}}
	>
		{open && children}
	</aside>
);
