"use client";

import type { ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
	DEFAULT_SIDEBAR_WIDTH,
	type SidebarPosition,
	useSidebar,
} from "@/hooks/use-sidebars";
import { cn } from "@/lib/utils";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "../../sheet";
import { TooltipOnHover } from "../../tooltip";

type ResizableSidebarProps = {
	className?: string;
	children: ReactNode;
	position: SidebarPosition;
	sidebarTitle: string;
};

export const ResizableSidebar = ({
	className,
	children,
	position,
	sidebarTitle,
}: ResizableSidebarProps) => {
	const { open, setOpen, isMobile, toggle } = useSidebar({ position });

	if (isMobile) {
		return (
			<Sheet onOpenChange={setOpen} open={open}>
				<SheetContent
					className="inset-0 flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col gap-0 border-none bg-background p-0 pt-10"
					side={position}
				>
					<p className="px-4 pb-4 font-medium text-lg">{sidebarTitle}</p>

					<div className="flex h-full flex-col overflow-y-auto">{children}</div>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<aside
			className={cn(
				"relative flex p-0 transition-all duration-200 ease-in-out",
				className,
				{
					"ml-[0px] p-0": !open,
					"border-r": position === "left",
					"border-l": position === "right",
					"border-transparent": !open,
				}
			)}
			style={{
				width: open ? DEFAULT_SIDEBAR_WIDTH : 0,
			}}
		>
			{open && (
				<>
					{children}
					<SidebarHandle
						hotkeys={[position === "right" ? "bracketright" : "bracketleft"]}
						isCollapsed={!open}
						onToggle={toggle}
						position={position === "right" ? "left" : "right"}
					/>
				</>
			)}
			{!open && (
				<SidebarHandle
					hotkeys={[position === "right" ? "bracketright" : "bracketleft"]}
					isCollapsed={!open}
					onToggle={toggle}
					position={position === "right" ? "left" : "right"}
				/>
			)}
		</aside>
	);
};

type SidebarHandleProps = {
	isCollapsed?: boolean;
	onToggle: () => void;
	hotkeys?: string[];
	position?: "left" | "right";
	onClose?: () => void;
};

const SidebarHandle = ({
	isCollapsed,
	onToggle,
	hotkeys = ["bracketleft"],
	position = "right",
	onClose,
}: SidebarHandleProps) => {
	// Open the open on key stroke
	useHotkeys(
		hotkeys.join("+"), // Join with + for proper hotkey format (e.g., "shift+left")
		() => {
			onToggle();
		},
		{
			preventDefault: true,
		}
	);

	const handleClick = () => {
		onToggle();
		onClose?.();
	};

	const tooltipContent = isCollapsed ? (
		"Click to open"
	) : (
		<div className="flex flex-col gap-1">
			<span>Click to close</span>
		</div>
	);

	// Map keyboard key names to display-friendly versions for tooltip
	const displayShortcuts = hotkeys.map((key) => {
		switch (key) {
			case "bracketleft":
				return "[";
			case "bracketright":
				return "]";
			default:
				return key;
		}
	});

	return (
		<button
			className={cn(
				"absolute top-0.5 bottom-0.5 z-10 hidden max-h-screen w-[2px] items-center justify-center rounded-full hover:cursor-pointer hover:bg-border md:flex",
				{
					"-right-[1px]": !isCollapsed && position === "right",
					"-left-[1px]": !isCollapsed && position === "left",
				}
			)}
			onClick={handleClick}
			tabIndex={0}
			type="button"
		>
			<TooltipOnHover
				content={tooltipContent}
				delay={1000}
				shortcuts={displayShortcuts}
				side="right"
			>
				<div
					className={cn(
						"group flex h-full items-center justify-center border-transparent transition-all hover:cursor-pointe",
						position === "left" ? "border-r-2" : "border-l-2"
					)}
				/>
			</TooltipOnHover>
		</button>
	);
};
