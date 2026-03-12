"use client";

import type * as React from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
	value?: number;
	indicatorClassName?: string;
	indeterminate?: boolean;
};

const segmentedProgressStyle = {
	"--progress-segment-width": "2px",
	"--progress-segment-gap": "3px",
	"--progress-segment-repeat":
		"calc(var(--progress-segment-width) + var(--progress-segment-gap))",
	"--progress-min-fill": "var(--progress-segment-width)",
} as CSSProperties;

const segmentedProgressBackground =
	"repeating-linear-gradient(90deg, currentColor 0 var(--progress-segment-width), currentColor var(--progress-segment-width), transparent var(--progress-segment-width), transparent var(--progress-segment-repeat))";

const Progress = ({
	className,
	value = 0,
	indicatorClassName,
	indeterminate = false,
	style,
	...props
}: ProgressProps) => {
	const clampedValue = Math.min(100, Math.max(0, value));
	const fillWidth = indeterminate
		? "38%"
		: clampedValue === 0
			? "0%"
			: `max(${clampedValue}%, var(--progress-min-fill))`;

	return (
		<div
			aria-valuemax={indeterminate ? undefined : 100}
			aria-valuemin={indeterminate ? undefined : 0}
			aria-valuenow={indeterminate ? undefined : clampedValue}
			className={cn(
				"relative h-4 w-full overflow-hidden rounded-[2px] bg-secondary",
				className
			)}
			data-indeterminate={indeterminate ? "true" : undefined}
			data-slot="progress"
			role="progressbar"
			style={{ ...segmentedProgressStyle, ...style }}
			{...props}
		>
			<div
				aria-hidden="true"
				className="absolute inset-0 text-primary/12 dark:text-primary/20"
				data-slot="progress-track"
				style={{ backgroundImage: segmentedProgressBackground }}
			/>
			<div
				aria-hidden="true"
				className={cn(
					"absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-300 ease-out",
					indeterminate && "animate-[pulse_1.4s_ease-in-out_infinite]"
				)}
				data-slot="progress-fill"
				style={{ width: fillWidth }}
			>
				<div
					className={cn("absolute inset-0 text-primary", indicatorClassName)}
					style={{ backgroundImage: segmentedProgressBackground }}
				/>
			</div>
		</div>
	);
};
Progress.displayName = "Progress";

export { Progress };
