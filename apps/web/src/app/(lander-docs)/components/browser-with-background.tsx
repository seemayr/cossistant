"use client";

import type { ReactNode } from "react";
import { BackgroundImage } from "@/components/ui/background-image";

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
			className={`relative flex w-full items-center justify-center overflow-hidden bg-background-200 ${containerClassName}`}
		>
			{/* Background Image */}
			<BackgroundImage
				alt="Cossistant Background"
				asciiOpacity={0.5}
				imgClassName="dark:opacity-20 opacity-5"
				largeSrc="https://cdn.cossistant.com/landing/main-large.jpg"
				mediumSrc="https://cdn.cossistant.com/landing/main-medium.jpg"
				portraitOnMobile
				resolution={0.01}
				showImage={false}
				smallSrc="https://cdn.cossistant.com/landing/main-small.jpg"
			/>

			{/* Browser Window Container */}
			<div className="relative z-10 flex flex-1 items-center justify-center">
				<div
					className={`fake-browser-wrapper overflow-hidden rounded-md border border-primary/10 shadow-2xl dark:shadow-primary/5 ${browserClassName}`}
				>
					{/* iOS Browser Chrome */}
					<div className="flex h-full w-full flex-col overflow-hidden bg-background dark:bg-background-100">
						{/* Browser Top Bar */}
						<div className="flex items-center justify-between gap-2 border-primary/5 border-b px-4 py-1 dark:bg-background-100">
							{/* Traffic Lights */}
							<div className="flex w-20 gap-2">
								<div className="size-2.5 rounded-full bg-red-500" />
								<div className="size-2.5 rounded-full bg-yellow-500" />
								<div className="size-2.5 rounded-full bg-green-500" />
							</div>
							{/* URL Bar */}
							<div className="ml-4 flex flex-1 items-center justify-center gap-2 px-3 py-1.5">
								<span className="rounded-md bg-background-400 px-2 py-1 text-primary/60 text-xs">
									https://cossistant.com/shadcn/inbox
								</span>
							</div>
							<div className="w-20" />
						</div>
						{/* Browser Content */}
						<div className="flex-1 bg-background">{children}</div>
					</div>
				</div>
			</div>
		</div>
	);
}
