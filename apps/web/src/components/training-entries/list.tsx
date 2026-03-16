"use client";

import { type LucideIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TrainingEntryMenuAction = {
	label: string;
	onSelect: () => void;
	Icon: LucideIcon;
	disabled?: boolean;
	destructive?: boolean;
	separatorBefore?: boolean;
};

type TrainingEntryListProps = {
	isLoading?: boolean;
	emptyState?: ReactNode;
	children: ReactNode;
	className?: string;
	loadingCount?: number;
};

type TrainingEntryListSectionProps = {
	title: string;
	description?: string;
	children: ReactNode;
	className?: string;
};

type TrainingEntryRowProps = {
	href?: string;
	onClick?: () => void;
	onHoverPrefetch?: () => void;
	icon: ReactNode;
	primary: string;
	rightMeta?: ReactNode;
	actions?: TrainingEntryMenuAction[];
	focused?: boolean;
	className?: string;
};

function TrainingEntryRowContent({
	icon,
	primary,
	rightMeta,
}: Pick<TrainingEntryRowProps, "icon" | "primary" | "rightMeta">) {
	return (
		<>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-background-200 text-primary/70 dark:bg-background-300">
					{icon}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-primary">{primary}</p>
				</div>
			</div>
			{rightMeta ? (
				<div className="flex shrink-0 items-center gap-2">{rightMeta}</div>
			) : null}
		</>
	);
}

export function TrainingEntryList({
	isLoading = false,
	emptyState,
	children,
	className,
	loadingCount = 4,
}: TrainingEntryListProps) {
	const childCount = Array.isArray(children)
		? children.length
		: Number(Boolean(children));

	if (isLoading) {
		return (
			<div className={cn("space-y-1", className)}>
				{Array.from({ length: loadingCount }).map((_, index) => (
					<div
						className="flex items-center gap-3 rounded px-2 py-2"
						key={`training-entry-skeleton-${index}`}
					>
						<Skeleton className="size-8 rounded-[8px]" />
						<div className="flex min-w-0 flex-1 items-center gap-4">
							<Skeleton className="h-4 w-52 shrink-0" />
							<Skeleton className="hidden h-4 flex-1 md:block" />
						</div>
						<Skeleton className="h-4 w-24 shrink-0" />
					</div>
				))}
			</div>
		);
	}

	if (childCount === 0) {
		return emptyState ?? null;
	}

	return <div className={cn("space-y-1", className)}>{children}</div>;
}

export function TrainingEntryListSection({
	title,
	description,
	children,
	className,
}: TrainingEntryListSectionProps) {
	return (
		<section className={cn("space-y-2", className)}>
			<div className="px-2">
				<div className="font-medium text-sm">{title}</div>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{children}
		</section>
	);
}

export function TrainingEntryRow({
	href,
	onClick,
	onHoverPrefetch,
	icon,
	primary,
	rightMeta,
	actions = [],
	focused = false,
	className,
}: TrainingEntryRowProps) {
	const baseClasses = cn(
		"group/training-entry relative flex w-full min-w-0 items-center gap-3 rounded px-2 py-2 text-left text-sm transition-colors",
		"bg-transparent hover:bg-background-200/80 dark:hover:bg-background-300/70",
		focused && "bg-background-200 text-primary dark:bg-background-300",
		className
	);
	const contentClasses =
		"flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[inherit] focus-visible:outline-none focus-visible:ring-0";

	const content = (
		<TrainingEntryRowContent
			icon={icon}
			primary={primary}
			rightMeta={rightMeta}
		/>
	);

	return (
		<div className={baseClasses}>
			{href ? (
				<Link
					className={contentClasses}
					href={href}
					onFocus={onHoverPrefetch}
					onMouseEnter={onHoverPrefetch}
					prefetch={false}
				>
					{content}
				</Link>
			) : (
				<button
					className={contentClasses}
					onClick={onClick}
					onFocus={onHoverPrefetch}
					onMouseEnter={onHoverPrefetch}
					type="button"
				>
					{content}
				</button>
			)}
			{actions.length > 0 ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-focus-within/training-entry:opacity-100 group-hover/training-entry:opacity-100"
							size="icon"
							variant="ghost"
						>
							<MoreHorizontalIcon className="size-4" />
							<span className="sr-only">Open entry actions</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{actions.map((action) => [
							action.separatorBefore ? (
								<DropdownMenuSeparator key={`${action.label}-separator`} />
							) : null,
							<DropdownMenuItem
								className={
									action.destructive
										? "text-destructive focus:text-destructive"
										: undefined
								}
								disabled={action.disabled}
								key={action.label}
								onClick={action.onSelect}
							>
								<action.Icon className="mr-2 size-4" />
								{action.label}
							</DropdownMenuItem>,
						])}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</div>
	);
}

export type {
	TrainingEntryListProps,
	TrainingEntryListSectionProps,
	TrainingEntryMenuAction,
	TrainingEntryRowProps,
};
