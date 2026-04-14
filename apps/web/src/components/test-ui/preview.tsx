import type { HTMLAttributes, ReactNode } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TestUiPreviewTheme = "light" | "dark";

type DivProps = HTMLAttributes<HTMLDivElement> & {
	[key: `data-${string}`]: string | undefined;
};

type TestUiPreviewFrameProps = DivProps & {
	children: ReactNode;
	theme: TestUiPreviewTheme;
};

type TestUiPreviewSurfaceProps = {
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	fallback?: ReactNode;
	theme: TestUiPreviewTheme;
	cardProps?: DivProps;
	contentProps?: DivProps;
	frameProps?: Omit<TestUiPreviewFrameProps, "children" | "theme">;
	frameClassName?: string;
};

type TestUiPreviewUnsupportedProps = DivProps & {
	title: ReactNode;
	description: ReactNode;
};

export function TestUiPreviewFrame({
	children,
	theme,
	className,
	...props
}: TestUiPreviewFrameProps) {
	return (
		<div
			{...props}
			className={cn(
				"min-h-[540px] overflow-hidden rounded-[1.5rem] border shadow-sm",
				theme === "dark"
					? "dark border-border/60 bg-background-100 text-foreground"
					: "border-border/70 bg-background text-foreground",
				className
			)}
			data-color-scheme={theme}
			data-test-ui-preview-frame="true"
			data-test-ui-preview-theme={theme}
		>
			{children}
		</div>
	);
}

export function TestUiPreviewSurface({
	title,
	description,
	children,
	fallback,
	theme,
	cardProps,
	contentProps,
	frameProps,
	frameClassName,
}: TestUiPreviewSurfaceProps) {
	return (
		<Card {...cardProps} className={cn(cardProps?.className)}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<CardContent {...contentProps} className={cn(contentProps?.className)}>
				{fallback ? (
					fallback
				) : (
					<TestUiPreviewFrame
						{...frameProps}
						className={cn(frameClassName, frameProps?.className)}
						theme={theme}
					>
						{children}
					</TestUiPreviewFrame>
				)}
			</CardContent>
		</Card>
	);
}

export function TestUiPreviewUnsupported({
	title,
	description,
	className,
	...props
}: TestUiPreviewUnsupportedProps) {
	return (
		<div
			{...props}
			className={cn(
				"flex min-h-[540px] items-center justify-center rounded-[1.5rem] border border-border/70 border-dashed bg-muted/20 px-6 text-center",
				className
			)}
		>
			<div className="space-y-2">
				<p className="font-medium text-sm">{title}</p>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
		</div>
	);
}
