"use client";

import { motion } from "motion/react";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function ComponentPreviewTabs({
	className,
	align = "center",
	component,
	source,
	withOrnament = false,
	sizeClasses = "min-h-[350px] md:min-h-[450px]",
}: React.ComponentProps<"div"> & {
	align?: "center" | "start" | "end";
	component: React.ReactNode;
	source: React.ReactNode;
	withOrnament?: boolean;
	sizeClasses?: string;
}) {
	const [tab, setTab] = React.useState("preview");

	return (
		<div
			className={cn(
				"group relative flex h-full w-full flex-col gap-2",
				className
			)}
		>
			<Tabs className="relative pl-6" onValueChange={setTab} value={tab}>
				<TabsList className="grid grid-cols-2">
					<TabsTrigger value="preview">Preview</TabsTrigger>
					<TabsTrigger value="code">Code</TabsTrigger>
				</TabsList>
			</Tabs>
			<div className="relative w-full max-w-full rounded p-[3px]">
				{withOrnament && (
					<>
						{/* left */}
						<motion.div
							animate={{ scaleY: 1 }}
							className="-top-10 -bottom-10 pointer-events-none absolute left-0 hidden w-px bg-primary/20 md:block"
							initial={{ scaleY: 0 }}
							style={{ originY: 0.5 }}
							transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
						/>
						<motion.div
							animate={{ scaleY: 1 }}
							className="-top-6 -bottom-6 pointer-events-none absolute left-4 z-[-1] hidden w-px bg-primary/20 md:block"
							initial={{ scaleY: 0 }}
							style={{ originY: 0.5 }}
							transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
						/>

						{/* right */}
						<motion.div
							animate={{ scaleY: 1 }}
							className="-top-10 -bottom-10 -right-px pointer-events-none absolute hidden w-px bg-primary/20 md:block"
							initial={{ scaleY: 0 }}
							style={{ originY: 0.5 }}
							transition={{ duration: 0.8, delay: 0, ease: "easeOut" }}
						/>
						<motion.div
							animate={{ scaleY: 1 }}
							className="-top-6 -bottom-6 pointer-events-none absolute right-4 z-[-1] hidden w-px bg-primary/20 md:block"
							initial={{ scaleY: 0 }}
							style={{ originY: 0.5 }}
							transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
						/>

						{/* top */}
						<motion.div
							animate={{ scaleX: 1 }}
							className="-left-6 -right-6 pointer-events-none absolute top-0 hidden h-px bg-primary/20 md:block"
							initial={{ scaleX: 0 }}
							style={{ originX: 0.5 }}
							transition={{ duration: 0.8, delay: 0.8, ease: "easeOut" }}
						/>
						<motion.div
							animate={{ scaleX: 1 }}
							className="-left-6 -right-6 pointer-events-none absolute top-4 z-[-1] hidden h-px bg-primary/20 md:block"
							initial={{ scaleX: 0 }}
							style={{ originX: 0.5 }}
							transition={{ duration: 0.8, delay: 1, ease: "easeOut" }}
						/>

						{/* bottom */}
						<motion.div
							animate={{ scaleX: 1 }}
							className="-left-6 -right-6 pointer-events-none absolute bottom-0 hidden h-px bg-primary/20 md:block"
							initial={{ scaleX: 0 }}
							style={{ originX: 0.5 }}
							transition={{ duration: 0.8, delay: 1.6, ease: "easeOut" }}
						/>
						<motion.div
							animate={{ scaleX: 1 }}
							className="-left-6 -right-6 pointer-events-none absolute bottom-4 z-[-1] hidden h-px bg-primary/20 md:block"
							initial={{ scaleX: 0 }}
							style={{ originX: 0.5 }}
							transition={{ duration: 0.8, delay: 1.8, ease: "easeOut" }}
						/>
					</>
				)}
				{tab === "preview" && (
					<div className={cn("h-full w-full min-w-0 p-4", sizeClasses)}>
						{component}
					</div>
				)}
				{tab === "code" && (
					<div
						className={cn(
							"scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-background-100 h-full w-full overflow-auto px-5 py-4 dark:bg-background-100",
							sizeClasses
						)}
					>
						{source}
					</div>
				)}
			</div>
		</div>
	);
}
