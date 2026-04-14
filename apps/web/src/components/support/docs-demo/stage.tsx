import type * as React from "react";
import { cn } from "@/lib/utils";

type SupportDemoStageVariant = "bubble" | "panel" | "floating" | "responsive";

const stageClasses: Record<SupportDemoStageVariant, string> = {
	bubble: "min-h-[220px] md:min-h-[260px]",
	panel: "min-h-[420px] md:min-h-[480px]",
	floating: "min-h-[460px] md:min-h-[520px]",
	responsive: "min-h-[460px] md:min-h-[520px]",
};

const shellClasses: Record<SupportDemoStageVariant, string> = {
	bubble: "w-full",
	panel: "h-[420px] w-full max-w-[400px] md:h-[480px]",
	floating: "h-[460px] w-full max-w-[420px] md:h-[520px]",
	responsive: "h-[460px] w-full max-w-[420px] md:h-[520px]",
};

export function SupportDemoStage({
	children,
	className,
	shellClassName,
	variant,
}: {
	children: React.ReactNode;
	className?: string;
	shellClassName?: string;
	variant: SupportDemoStageVariant;
}) {
	return (
		<div
			className={cn(
				"flex w-full min-w-0 items-center justify-center overflow-hidden",
				stageClasses[variant],
				className
			)}
			data-support-demo-stage=""
			data-support-demo-variant={variant}
		>
			<div
				className={cn(
					"relative flex min-w-0 items-center justify-center",
					shellClasses[variant],
					shellClassName
				)}
			>
				{children}
			</div>
		</div>
	);
}
