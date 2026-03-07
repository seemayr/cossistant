"use client";

import {
	PRESENCE_AWAY_WINDOW_MS,
	PRESENCE_ONLINE_WINDOW_MS,
} from "@cossistant/types";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { Facehash as FacehashComponent } from "facehash";
import type * as React from "react";
import { formatTimeAgo } from "@/lib/date";
import { COSSISTANT_FACEHASH_COLOR_CLASSES } from "@/lib/facehash-palette";
import { cn } from "@/lib/utils";
import { TooltipOnHover } from "./tooltip";

function AvatarContainer({
	className,
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
	return (
		<AvatarPrimitive.Root
			className={cn(
				"relative flex size-8 shrink-0 overflow-hidden rounded",
				className
			)}
			data-slot="avatar"
			{...props}
		/>
	);
}

function AvatarImage({
	className,
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
	return (
		<AvatarPrimitive.Image
			className={cn("aspect-square size-full", className)}
			data-slot="avatar-image"
			{...props}
		/>
	);
}

interface AvatarFallbackProps
	extends React.ComponentProps<typeof AvatarPrimitive.Fallback> {
	value?: string | null;
	children?: string;
}

function getNonEmptyString(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
}

function Facehash({
	className,
	name,
	interactive = true,
}: {
	className?: string;
	name: string;
	interactive?: boolean;
}) {
	return (
		<FacehashComponent
			className={cn(className)}
			colorClasses={COSSISTANT_FACEHASH_COLOR_CLASSES}
			enableBlink
			intensity3d="dramatic"
			interactive={interactive}
			name={name}
			size="100%"
			style={{
				color: "#000000",
			}}
		/>
	);
}

function AvatarFallback({
	className,
	value,
	children,
	...props
}: AvatarFallbackProps) {
	const facehashName =
		getNonEmptyString(value) ?? getNonEmptyString(children) ?? "avatar";

	return (
		<AvatarPrimitive.Fallback
			className={cn("flex size-full items-center justify-center", className)}
			data-slot="avatar-fallback"
			{...props}
		>
			<Facehash name={facehashName} />
		</AvatarPrimitive.Fallback>
	);
}

function Avatar({
	className,
	url,
	fallbackName,
	facehashSeed,
	lastOnlineAt,
	status,
}: {
	className?: string;
	url: string | null | undefined;
	fallbackName: string;
	facehashSeed?: string;
	lastOnlineAt?: string | null;
	status?: "online" | "away";
}) {
	const now = Date.now();
	const lastOnlineDate = lastOnlineAt ? new Date(lastOnlineAt) : null;
	const lastOnlineTime = lastOnlineDate ? lastOnlineDate.getTime() : null;

	let computedStatus: "online" | "away" | null = status ?? null;

	if (
		!computedStatus &&
		lastOnlineTime !== null &&
		!Number.isNaN(lastOnlineTime)
	) {
		if (lastOnlineTime >= now - PRESENCE_ONLINE_WINDOW_MS) {
			computedStatus = "online";
		} else if (lastOnlineTime >= now - PRESENCE_AWAY_WINDOW_MS) {
			computedStatus = "away";
		}
	}

	const isOnline = computedStatus === "online";
	const isAway = computedStatus === "away";
	const awayWindowMinutes = Math.round(PRESENCE_AWAY_WINDOW_MS / 60_000);

	const tooltipContent = lastOnlineDate
		? isOnline
			? `${fallbackName} is online`
			: isAway
				? `${fallbackName} last seen less than ${awayWindowMinutes} minutes ago`
				: `${fallbackName} last seen ${formatTimeAgo(lastOnlineDate)}`
		: null;

	return (
		<TooltipOnHover content={tooltipContent}>
			<div className="relative">
				<AvatarContainer
					className={cn(
						"size-8 shrink-0 ring-1 ring-border ring-offset-1 ring-offset-background",
						className
					)}
				>
					{url && <AvatarImage alt={fallbackName} src={url} />}
					<AvatarFallback
						className="pointer-events-none"
						value={facehashSeed ?? fallbackName}
					>
						{fallbackName}
					</AvatarFallback>
				</AvatarContainer>
				{(isOnline || isAway) && (
					<div
						className={cn(
							"-right-1 absolute bottom-0.5 hidden size-[5px] rounded-full ring-2 ring-background",
							{
								"block bg-cossistant-green": isOnline,
								"block bg-cossistant-orange": isAway,
							}
						)}
					/>
				)}
			</div>
		</TooltipOnHover>
	);
}

export { AvatarContainer, AvatarImage, AvatarFallback, Avatar, Facehash };
