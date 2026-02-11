"use client";

import { DEFAULT_SIDEBAR_WIDTH } from "@/hooks/use-sidebars";
import { cn } from "@/lib/utils";
import { Skeleton } from "../../skeleton";

type SkeletonSidebarItemProps = {
	hasIcon?: boolean;
	width?: string;
};

function SkeletonSidebarItem({
	hasIcon = true,
	width = "w-24",
}: SkeletonSidebarItemProps) {
	return (
		<div className="flex h-10 items-center gap-2.5 rounded-md px-3 py-1">
			{hasIcon && <Skeleton className="size-4 shrink-0 rounded" />}
			<Skeleton className={cn("h-3 rounded", width)} />
		</div>
	);
}

type BlurredAgentsSidebarProps = {
	className?: string;
};

export function BlurredAgentsSidebar({ className }: BlurredAgentsSidebarProps) {
	return (
		<div
			className={cn(
				"pointer-events-none relative flex h-full shrink-0 select-none flex-col border-primary/10 border-r dark:border-primary/5",
				className
			)}
			style={{ width: DEFAULT_SIDEBAR_WIDTH }}
		>
			{/* Blur overlay */}
			<div className="absolute inset-0 z-10 backdrop-blur-[2px]" />

			{/* Content */}
			<div className="relative flex w-full flex-col gap-1 px-2 py-2 opacity-40">
				{/* General */}
				<div className="flex flex-col gap-1">
					<SkeletonSidebarItem width="w-16" />
				</div>

				{/* Knowledge Section (collapsible style) */}
				<div className="mt-4 flex flex-col gap-1">
					<SkeletonSidebarItem width="w-20" />
					{/* Sub-items */}
					<div className="ml-6 flex flex-col gap-1">
						<SkeletonSidebarItem hasIcon={false} width="w-20" />
						<SkeletonSidebarItem hasIcon={false} width="w-10" />
						<SkeletonSidebarItem hasIcon={false} width="w-12" />
					</div>
				</div>

				{/* Capabilities Section (collapsible style) */}
				<div className="mt-2 flex flex-col gap-1">
					<SkeletonSidebarItem width="w-24" />
					{/* Sub-items */}
					<div className="ml-6 flex flex-col gap-1">
						<SkeletonSidebarItem hasIcon={false} width="w-12" />
						<SkeletonSidebarItem hasIcon={false} width="w-14" />
						<SkeletonSidebarItem hasIcon={false} width="w-20" />
					</div>
				</div>

				{/* Footer */}
				<div className="mt-auto flex flex-col gap-1 pt-4">
					<SkeletonSidebarItem hasIcon={false} width="w-10" />
					<SkeletonSidebarItem hasIcon={false} width="w-16" />
					<div className="my-2 h-px w-full bg-border/30" />
					<SkeletonSidebarItem width="w-28" />
				</div>
			</div>
		</div>
	);
}
