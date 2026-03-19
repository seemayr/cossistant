"use client";

import type { ReactNode } from "react";
import { BrowserShell } from "@/components/showcase/browser-shell";
import { Background } from "@/components/ui/background";
import { cn } from "@/lib/utils";

type BrowserWithBackgroundProps = {
	children?: ReactNode;
	containerClassName?: string;
	browserClassName?: string;
	contentClassName?: string;
};

export function BrowserWithBackground({
	children,
	containerClassName = "",
	browserClassName = "",
	contentClassName = "",
}: BrowserWithBackgroundProps) {
	return (
		<div
			className={cn(
				"relative flex w-full items-center justify-center overflow-hidden bg-background-100 dark:bg-background-200",
				containerClassName
			)}
		>
			<Background asciiOpacity={0.5} fieldOpacity={0.14} resolution={0.05} />
			<div
				className={cn(
					"pointer-events-none relative z-10 flex flex-1 items-center justify-center overflow-hidden",
					contentClassName
				)}
			>
				<BrowserShell
					className={cn("fake-browser-wrapper", browserClassName)}
					contentClassName="bg-background"
				>
					{children}
				</BrowserShell>
			</div>
		</div>
	);
}
