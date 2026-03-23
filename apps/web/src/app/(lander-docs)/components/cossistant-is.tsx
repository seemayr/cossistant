"use client";

import {
	motion,
	useReducedMotion,
	useScroll,
	useTransform,
} from "motion/react";
import { useRef } from "react";
import { Facehash } from "@/components/ui/avatar";
import { Logos } from "../../../components/ui/logos";

function CossistantIs() {
	const sectionRef = useRef<HTMLElement | null>(null);
	const prefersReducedMotion = useReducedMotion();
	const { scrollYProgress } = useScroll({
		target: sectionRef,
		offset: ["start end", "end start"],
	});
	const y = useTransform(
		scrollYProgress,
		[0, 1],
		prefersReducedMotion ? [0, 0] : [50, -50]
	);

	return (
		<section
			className="flex flex-col gap-6 px-4 py-40"
			ref={sectionRef}
			suppressHydrationWarning
		>
			<motion.h2
				className="mx-auto max-w-2xl text-pretty text-center font-f37-stout text-2xl text-primary/70 leading-relaxed md:text-left md:text-[34px]"
				style={{ y }}
			>
				<span className="text-primary">
					Support isn't just about answering questions. It's about keeping users{" "}
					<span className="inline-flex items-center justify-center rounded-md border border-border border-dashed p-1 align-middle">
						<div className="inline-block size-7 max-w-7 rounded-xs border border-background bg-background align-middle">
							<Facehash name="UU" />
						</div>
						<div className="ml-1 inline-block size-7 max-w-7 rounded-xs border border-background bg-background align-middle">
							<Facehash name="AAAk" />
						</div>
						<div className="ml-1 inline-block size-7 max-w-7 rounded-xs border border-background bg-background align-middle">
							<Facehash name="I" />
						</div>
					</span>{" "}
					moving.
				</span>
				<br />
				<br />
				Cossistant answers the common questions, covers your team when you
				can't, and learns from the people who know your product best:{" "}
				<span className="text-primary">you.</span>
				<br />
				<br />
				Every answer you add makes it better.{" "}
				<span className="text-primary">
					Every fix you make makes the next conversation easier.
				</span>
				<br />
				<br />
				<span className="text-primary">
					Built for React{" "}
					<span className="inline-flex items-center justify-center rounded-md border border-border border-dashed p-1 align-middle">
						<Logos.react className="size-5" />
					</span>{" "}
					and Next.js{" "}
					<span className="inline-flex items-center justify-center rounded-md border border-border border-dashed p-1 align-middle">
						<Logos.nextjs className="size-5" />
					</span>
				</span>
				, so it feels like part of your product not someone else's.
			</motion.h2>
		</section>
	);
}

export default CossistantIs;
