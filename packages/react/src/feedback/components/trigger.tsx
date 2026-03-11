"use client";

import type * as React from "react";
import { Icon } from "../../support/components/icons";
import { cn } from "../../support/utils";
import type { FeedbackTriggerRenderProps } from "../internal/trigger";
import { FeedbackTriggerPrimitive } from "../internal/trigger";

export type DefaultTriggerProps = {
	className?: string;
};

export const DefaultTrigger: React.FC<DefaultTriggerProps> = ({
	className,
}) => (
	<FeedbackTriggerPrimitive asChild>
		{({ isOpen }: FeedbackTriggerRenderProps) => (
			<button
				aria-label={isOpen ? "Close feedback" : "Open feedback"}
				className={cn(
					"relative z-[9999] inline-flex h-14 w-14 items-center justify-center rounded-full bg-co-background text-co-primary shadow-lg ring-1 ring-co-border/80 backdrop-blur transition-all hover:scale-[1.02] hover:bg-co-background-50 active:scale-95",
					className
				)}
				type="button"
			>
				<Icon
					className={cn(
						"h-5 w-5 transition-transform",
						isOpen && "rotate-12 scale-110"
					)}
					name="star"
					variant={isOpen ? "filled" : "default"}
				/>
			</button>
		)}
	</FeedbackTriggerPrimitive>
);
