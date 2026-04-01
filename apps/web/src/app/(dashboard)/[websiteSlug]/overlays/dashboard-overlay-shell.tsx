"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

type DashboardOverlayShellProps = React.ComponentProps<"div"> & {
	children: React.ReactNode;
	dataSlot: string;
	zIndexClassName?: string;
};

export function DashboardOverlayShell({
	children,
	className,
	dataSlot,
	zIndexClassName = "z-20",
	...props
}: DashboardOverlayShellProps) {
	return (
		<div
			className={cn(
				"absolute inset-x-0 top-15 bottom-0 flex flex-col overflow-hidden bg-background",
				zIndexClassName,
				className
			)}
			data-slot={dataSlot}
			{...props}
		>
			{children}
		</div>
	);
}

type DashboardOverlayCenteredStateProps = React.ComponentProps<"div"> & {
	children: React.ReactNode;
};

export function DashboardOverlayCenteredState({
	children,
	className,
	...props
}: DashboardOverlayCenteredStateProps) {
	return (
		<div
			className={cn("flex h-full items-center justify-center", className)}
			{...props}
		>
			{children}
		</div>
	);
}
