"use client";

import type * as React from "react";
import { forwardRef, useImperativeHandle } from "react";

import { useScrollMask } from "@/hooks/use-scroll-mask";
import { cn } from "@/lib/utils";

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & {
	orientation?: "vertical" | "horizontal" | "both";
	scrollMask?: boolean;
	maskHeight?: string;
	scrollbarWidth?: string;
};

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
	(
		{
			className,
			children,
			orientation = "vertical",
			scrollMask = false,
			maskHeight = "54px",
			scrollbarWidth = "8px",
			...props
		},
		ref
	) => {
		const { ref: maskRef, style: maskStyle } = useScrollMask({
			maskHeight,
			scrollbarWidth,
		});

		useImperativeHandle(ref, () => maskRef.current as HTMLDivElement, []);

		return (
			<div
				className={cn(
					"scrollbar-thin scrollbar-thumb-background-50 dark:scrollbar-thumb-background-300 scrollbar-track-background-50 dark:scrollbar-track-fd-overlay",
					orientation === "vertical" && "overflow-x-hidden overflow-y-scroll",
					orientation === "horizontal" && "overflow-y-hidden overflow-x-scroll",
					orientation === "both" && "overflow-scroll",
					className
				)}
				data-slot="scroll-area"
				ref={maskRef}
				style={scrollMask ? maskStyle : undefined}
				{...props}
			>
				{children}
			</div>
		);
	}
);

ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
