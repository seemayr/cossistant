"use client";

import Link from "next/link";

import { LogoText } from "@/components/ui/logo";
import { TopbarButton } from "@/components/ui/topbar-button";
import { cn } from "@/lib/utils";

export function TopBar({
	className,
	children,
}: {
	className?: string;
	children?: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"fixed top-0 right-0 left-0 z-50 border-grid-x border-dashed bg-background/90 backdrop-blur-xl",
				className
			)}
		>
			<div className="container-wrapper mx-auto">
				<div className="container mx-auto flex items-center justify-between py-4">
					<div className="flex items-center gap-6">
						<Link className="flex items-center" href="/">
							<LogoText />
						</Link>
						<div className="hidden items-center space-x-4 md:flex">
							<TopbarButton className="text-foreground" href="/docs">
								Docs
							</TopbarButton>
							<TopbarButton href="/blog">Blog</TopbarButton>
							<TopbarButton className="text-foreground" href="/changelog">
								Changelog
							</TopbarButton>
							<TopbarButton className="text-foreground" href="/pricing">
								Pricing
							</TopbarButton>
						</div>
					</div>

					<div className="flex w-60 items-center justify-end gap-3">
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
