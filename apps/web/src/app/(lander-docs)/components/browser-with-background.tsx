"use client";

import type { ReactNode } from "react";
import { BrowserShell } from "@/components/showcase/browser-shell";
import { Background } from "@/components/ui/background";
import { cn } from "@/lib/utils";

type BrowserWithBackgroundProps = {
	children?: ReactNode;
	containerClassName?: string;
	browserClassName?: string;
};

export function BrowserWithBackground({
	children,
	containerClassName = "",
	browserClassName = "",
}: BrowserWithBackgroundProps) {
	return (
		<div
			className={cn(
				"relative flex w-full items-center justify-center overflow-hidden bg-background-200 dark:bg-background-400",
				containerClassName
			)}
		>
			<Background asciiOpacity={0.5} fieldOpacity={0.14} resolution={0.05} />
			<div className="pointer-events-none relative z-10 flex flex-1 items-center justify-center">
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
