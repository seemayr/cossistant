"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { Facehash } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const FACEHASH_SEEDS = ["UU", "AAAk", "I"] as const;
const COLLAPSED_OFFSETS = [0, 12, 24] as const;
const EXPANDED_OFFSETS = [0, 31, 62] as const;

export function MovingUsersFacehashes() {
	const ref = useRef<HTMLSpanElement | null>(null);
	const prefersReducedMotion = useReducedMotion();
	const isExpanded = useInView(ref, {
		margin: "-45% 0px -45% 0px",
		once: false,
	});

	const transition = prefersReducedMotion
		? { duration: 0 }
		: {
				type: "spring" as const,
				stiffness: 280,
				damping: 24,
				mass: 0.7,
			};

	return (
		<span
			aria-hidden="true"
			className="relative inline-flex h-9 w-[6.375rem] shrink-0 items-center rounded-md border border-border border-dashed p-1 align-middle"
			ref={ref}
		>
			{FACEHASH_SEEDS.map((seed, index) => (
				<motion.span
					animate={{
						opacity: index === 0 ? 1 : isExpanded ? 1 : 0.96,
						scale: index === 0 ? 1 : isExpanded ? 1 : 0.98,
						x: isExpanded ? EXPANDED_OFFSETS[index] : COLLAPSED_OFFSETS[index],
					}}
					className={cn(
						"absolute top-1 left-1 inline-block size-7 max-w-7 rounded-xs border border-background bg-background",
						index === 0 ? "z-30" : index === 1 ? "z-20" : "z-10"
					)}
					key={seed}
					transition={transition}
				>
					<Facehash name={seed} />
				</motion.span>
			))}
		</span>
	);
}
