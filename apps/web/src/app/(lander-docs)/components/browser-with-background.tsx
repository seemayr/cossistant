"use client";

import type { ReactNode } from "react";
import { BrowserShell } from "@/components/showcase/browser-shell";
import { BackgroundImage } from "@/components/ui/background-image";
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
				"relative flex w-full items-center justify-center overflow-hidden bg-background-200",
				containerClassName
			)}
		>
			<BackgroundImage
				alt="Cossistant Background"
				asciiOpacity={0.5}
				imgClassName="dark:opacity-20 opacity-5"
				largeSrc="https://cdn.cossistant.com/landing/main-large.jpg"
				mediumSrc="https://cdn.cossistant.com/landing/main-medium.jpg"
				portraitOnMobile
				resolution={0.05}
				shimmerTintStrength={1}
				showImage={false}
				smallSrc="https://cdn.cossistant.com/landing/main-small.jpg"
			/>
			<div className="relative z-10 flex flex-1 items-center justify-center">
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
