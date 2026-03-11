"use client";

import Image from "next/image";
import type { CSSProperties, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { BrowserShell } from "@/components/showcase/browser-shell";
import {
	StaticWidgetBubble,
	WidgetShell,
} from "@/components/showcase/widget-shell";
import { cn } from "@/lib/utils";

export type ScreenshotFrameItem = {
	src: string;
	alt: string;
	legend?: string;
	position?: "centered" | "bottom";
	zoomLevel?: number;
	xOffsetRatio?: number;
	yOffsetRatio?: number;
	browserUrl?: string;
};

export type ScreenshotFrameProps = {
	type: "browser" | "widget";
	items: ScreenshotFrameItem[];
	backgroundColor?: string;
	backgroundImageSrc?: string;
	strictContainerWidth?: boolean;
	className?: string;
};

const BREAKOUT_WIDTH_CLASSNAME =
	"2xl:relative 2xl:left-1/2 2xl:w-[min(calc(100%+360px),calc(100vw-2rem))] 2xl:max-w-none 2xl:-translate-x-1/2";

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

export function getScreenshotFrameWidthClassName(strictContainerWidth = false) {
	return strictContainerWidth
		? "w-full"
		: cn("w-full", BREAKOUT_WIDTH_CLASSNAME);
}

export function getScreenshotMediaStyle(
	item: ScreenshotFrameItem
): CSSProperties {
	const zoomLevel = Math.max(item.zoomLevel ?? 1, 1);
	const baseY = item.position === "bottom" ? 100 : 50;
	const xOffsetRatio = clamp(item.xOffsetRatio ?? 0, -1, 1);
	const yOffsetRatio = clamp(item.yOffsetRatio ?? 0, -1, 1);
	const xPosition = clamp(50 + xOffsetRatio * 50, 0, 100);
	const yPosition = clamp(baseY + yOffsetRatio * 50, 0, 100);

	return {
		objectPosition: `${xPosition}% ${yPosition}%`,
		transform: `scale(${zoomLevel})`,
		transformOrigin: "center",
	};
}

function ScreenshotMedia({
	item,
	className,
}: {
	item: ScreenshotFrameItem;
	className?: string;
}) {
	return (
		<Image
			alt={item.alt}
			className={cn(
				"absolute inset-0 h-full w-full object-cover transition-[transform,object-position] duration-300 ease-out",
				className
			)}
			data-slot="screenshot-frame-media"
			draggable={false}
			fill
			sizes="(max-width: 768px) calc(100vw - 2rem), (max-width: 1536px) 42rem, min(100vw - 2rem, 80rem)"
			src={item.src}
			style={getScreenshotMediaStyle(item)}
		/>
	);
}

function BrowserSlide({ item }: { item: ScreenshotFrameItem }) {
	return (
		<BrowserShell
			chromeUrl={item.browserUrl}
			className="w-full overflow-hidden rounded-[22px] border-white/40 bg-white/70 backdrop-blur-sm"
		>
			<div
				className="relative aspect-[16/10] w-full overflow-hidden bg-background-100"
				data-slot="screenshot-frame-browser-viewport"
			>
				<ScreenshotMedia item={item} />
				<div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/18 to-transparent" />
			</div>
		</BrowserShell>
	);
}

function WidgetSlide({ item }: { item: ScreenshotFrameItem }) {
	return (
		<div className="flex w-full justify-center px-2 py-3 sm:px-6 sm:py-4">
			<WidgetShell
				bubble={<StaticWidgetBubble className="opacity-85" />}
				className="w-full max-w-[420px]"
				frameClassName="aspect-[21/31] w-full"
			>
				<div className="absolute inset-x-0 top-0 z-10 flex h-18 items-center justify-between bg-co-background px-4">
					<div className="h-2.5 w-[72px] rounded-full bg-co-foreground/8" />
					<div className="flex items-center gap-2">
						<div className="size-2.5 rounded-full bg-co-foreground/10" />
						<div className="size-8 rounded-full bg-co-foreground/6" />
					</div>
				</div>
				<div className="flex h-full flex-col gap-3 p-3 pt-20">
					<div
						className="relative min-h-0 flex-1 overflow-hidden rounded-[18px] border border-co-border/60 bg-co-background-100"
						data-slot="screenshot-frame-widget-viewport"
					>
						<ScreenshotMedia item={item} />
						<div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-co-background/15 to-transparent" />
					</div>
					<div className="rounded-[16px] border border-co-border/70 bg-co-background-100 p-3 shadow-sm">
						<div className="h-12 rounded-xl bg-co-background-200/85" />
					</div>
				</div>
			</WidgetShell>
		</div>
	);
}

export function ScreenshotFrame({
	type,
	items,
	backgroundColor,
	backgroundImageSrc,
	strictContainerWidth = false,
	className,
}: ScreenshotFrameProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const activeItem =
		items[clamp(activeIndex, 0, Math.max(items.length - 1, 0))];
	const hasLegends = items.some((item) => item.legend?.trim());
	const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

	if (!activeItem) {
		return null;
	}

	const handleSelect = (index: number) => {
		setActiveIndex(clamp(index, 0, items.length - 1));
	};

	const handleKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		index: number
	) => {
		if (items.length <= 1) {
			return;
		}

		const isNextKey = event.key === "ArrowRight" || event.key === "ArrowDown";
		const isPreviousKey = event.key === "ArrowLeft" || event.key === "ArrowUp";

		if (!(isNextKey || isPreviousKey)) {
			return;
		}

		event.preventDefault();

		const nextIndex = isNextKey
			? (index + 1) % items.length
			: (index - 1 + items.length) % items.length;

		handleSelect(nextIndex);
		triggerRefs.current[nextIndex]?.focus();
	};

	return (
		<div
			className={cn(
				"not-prose my-10",
				getScreenshotFrameWidthClassName(strictContainerWidth),
				className
			)}
			data-breakout={!strictContainerWidth}
			data-slot="screenshot-frame"
			data-type={type}
		>
			<figure
				className="relative overflow-hidden rounded-[32px] border border-primary/10 bg-background-200 px-3 py-3 shadow-[0_30px_120px_-48px_rgba(15,23,42,0.45)] sm:px-4 sm:py-4 md:px-5 md:py-5 dark:shadow-black/35"
				style={{ backgroundColor }}
			>
				{backgroundImageSrc ? (
					<div
						aria-hidden="true"
						className="absolute inset-0 bg-center bg-cover opacity-[0.22] mix-blend-soft-light"
						style={{ backgroundImage: `url("${backgroundImageSrc}")` }}
					/>
				) : null}
				<div
					aria-hidden="true"
					className="absolute inset-x-[14%] top-[12%] h-[58%] rounded-full bg-white/65 blur-3xl dark:bg-white/8"
				/>
				<div
					aria-hidden="true"
					className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.38),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.22),transparent_42%,rgba(15,23,42,0.08)_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_38%,rgba(0,0,0,0.16)_100%)]"
				/>
				<div className="relative z-10">
					{type === "browser" ? (
						<BrowserSlide item={activeItem} />
					) : (
						<WidgetSlide item={activeItem} />
					)}
					{items.length > 1 ? (
						<div className="mt-5 flex justify-center">
							<fieldset
								className={cn(
									"inline-flex items-center gap-2 rounded-full border border-primary/10 bg-background/70 p-1.5 shadow-sm backdrop-blur-sm",
									hasLegends ? "flex-wrap justify-center" : ""
								)}
								data-has-legends={hasLegends}
								data-slot="screenshot-frame-navigation"
							>
								<legend className="sr-only">
									Screenshot gallery navigation
								</legend>
								{items.map((item, index) => {
									const isActive = index === activeIndex;
									const label =
										item.legend?.trim() || `Screenshot ${index + 1}`;

									return (
										<button
											aria-current={isActive ? "true" : undefined}
											aria-label={label}
											aria-pressed={isActive}
											className={cn(
												"inline-flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cossistant-orange/60",
												hasLegends
													? cn(
															"gap-2 px-3 py-2 font-medium text-sm",
															isActive
																? "bg-background text-foreground shadow-sm"
																: "text-muted-foreground hover:bg-background/70 hover:text-foreground"
														)
													: cn(
															"size-9",
															isActive
																? "bg-background shadow-sm"
																: "hover:bg-background/70"
														)
											)}
											key={`${item.src}-${index}`}
											onClick={() => handleSelect(index)}
											onKeyDown={(event) => handleKeyDown(event, index)}
											ref={(node) => {
												triggerRefs.current[index] = node;
											}}
											type="button"
										>
											<span
												className={cn(
													"rounded-full bg-primary/20 transition-colors",
													hasLegends ? "size-2.5" : "size-2.5",
													isActive && "bg-cossistant-orange"
												)}
											/>
											{hasLegends ? <span>{label}</span> : null}
										</button>
									);
								})}
							</fieldset>
						</div>
					) : null}
					<div aria-live="polite" className="sr-only">
						{activeItem.alt}
					</div>
				</div>
			</figure>
		</div>
	);
}
