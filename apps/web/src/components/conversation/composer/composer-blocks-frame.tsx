"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";

const COMPOSER_LAYOUT_EASE = [0.25, 0.46, 0.45, 0.94] as const;
const FRAME_TRANSITION = {
	duration: 0.12,
	ease: COMPOSER_LAYOUT_EASE,
} as const;
const SLOT_ENTER_TRANSITION = {
	duration: 0.12,
	ease: COMPOSER_LAYOUT_EASE,
} as const;
const SLOT_EXIT_TRANSITION = {
	duration: 0.09,
	ease: COMPOSER_LAYOUT_EASE,
} as const;
const SLOT_Y_OFFSET = {
	above: -4,
	bottom: 4,
	central: 0,
} as const;

type ComposerBlocksFrameProps = {
	children: React.ReactNode;
	highlighted?: boolean;
	className?: string;
};

type ComposerAnimatedSlotProps = {
	children?: React.ReactNode;
	slot: "above" | "bottom" | "central";
	slotKey: string;
	className?: string;
};

export function ComposerBlocksFrame({
	children,
	highlighted = false,
	className,
}: ComposerBlocksFrameProps) {
	return (
		<motion.div
			className={cn(
				"flex flex-col gap-1 rounded-[4px] border border-dashed p-1 transition-colors duration-200 dark:bg-background-50",
				highlighted ? "" : "border-transparent",
				className
			)}
			data-composer-frame={highlighted ? "highlighted" : "default"}
			layout="size"
			transition={FRAME_TRANSITION}
		>
			{children}
		</motion.div>
	);
}

export function ComposerAnimatedSlot({
	children,
	slot,
	slotKey,
	className,
}: ComposerAnimatedSlotProps) {
	const prefersReducedMotion = useReducedMotion();
	const yOffset = prefersReducedMotion ? 0 : SLOT_Y_OFFSET[slot];

	return (
		<AnimatePresence initial={false} mode="popLayout">
			{children ? (
				<motion.div
					animate={{
						opacity: 1,
						y: 0,
					}}
					className={cn("overflow-hidden", className)}
					data-composer-slot={slot}
					exit={{
						opacity: 0,
						y: slot === "central" ? 0 : yOffset,
						transition: {
							opacity: SLOT_EXIT_TRANSITION,
							y: SLOT_EXIT_TRANSITION,
						},
					}}
					initial={{
						opacity: 0,
						y: slot === "central" ? 0 : yOffset,
					}}
					key={slotKey}
					layout="position"
					transition={{
						layout: FRAME_TRANSITION,
						opacity: SLOT_ENTER_TRANSITION,
						y: SLOT_ENTER_TRANSITION,
					}}
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
