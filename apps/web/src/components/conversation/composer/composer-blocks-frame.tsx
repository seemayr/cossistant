"use client";

import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";

const SLOT_TRANSITION = {
	duration: 0.16,
	ease: "easeOut",
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
			layout
			transition={SLOT_TRANSITION}
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
	return (
		<AnimatePresence initial={false} mode="sync">
			{children ? (
				<motion.div
					animate={{
						opacity: 1,
						scale: 1,
						y: 0,
						transition: SLOT_TRANSITION,
					}}
					className={className}
					data-composer-slot={slot}
					exit={{
						opacity: 0,
						transition: {
							duration: 0.08,
							ease: "easeOut",
						},
					}}
					initial={{
						opacity: 0,
						scale: 0.995,
						y: 6,
					}}
					key={slotKey}
					layout="position"
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
