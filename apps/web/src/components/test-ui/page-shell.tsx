import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type RegionProps = HTMLAttributes<HTMLDivElement> & {
	[key: `data-${string}`]: string | undefined;
};

type TestUiPageShellProps = {
	controls: ReactNode;
	preview: ReactNode;
	secondary?: ReactNode;
	className?: string;
	rootProps?: RegionProps;
	controlsProps?: RegionProps;
	previewProps?: RegionProps;
	secondaryProps?: RegionProps;
};

export function TestUiPageShell({
	controls,
	preview,
	secondary,
	className,
	rootProps,
	controlsProps,
	previewProps,
	secondaryProps,
}: TestUiPageShellProps) {
	return (
		<div
			{...rootProps}
			className={cn(
				"grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)_320px]",
				className,
				rootProps?.className
			)}
		>
			<div
				{...controlsProps}
				className={cn("space-y-4", controlsProps?.className)}
			>
				{controls}
			</div>
			<div {...previewProps} className={cn(previewProps?.className)}>
				{preview}
			</div>
			<div
				{...secondaryProps}
				className={cn("space-y-4", secondaryProps?.className)}
			>
				{secondary}
			</div>
		</div>
	);
}
