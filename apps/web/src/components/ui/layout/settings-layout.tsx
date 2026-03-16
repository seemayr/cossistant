import type React from "react";
import { Page, PageContent, PageHeader } from "@/components/ui/layout";
import { cn } from "@/lib/utils";

type SettingsRowProps = {
	children: React.ReactNode;
	title: string;
	description?: string;
	variant?: "default" | "danger";
	className?: string;
};

type SettingsPageProps = {
	children: React.ReactNode;
	className?: string;
};

export function SettingsPage({ children, className }: SettingsPageProps) {
	return <Page className={cn(className)}>{children}</Page>;
}

export function SettingsHeader({ children }: { children: React.ReactNode }) {
	return (
		<PageHeader className="absolute z-10 border-b bg-background pr-3 pl-4 text-sm 2xl:border-transparent 2xl:bg-transparent dark:bg-background-50 dark:2xl:border-transparent 2xl:dark:bg-transparent">
			{children}
		</PageHeader>
	);
}

export function SettingsRow({
	children,
	title,
	description,
	variant = "default",
	className,
}: SettingsRowProps) {
	const isDanger = variant === "danger";

	return (
		<section
			className={cn(
				"mx-auto mb-8 flex w-full max-w-3xl flex-col gap-2 pb-8 last:mb-0 last:pb-0",
				className
			)}
		>
			<h1
				className={cn(
					"font-medium text-base",
					isDanger ? "text-destructive" : "text-primary"
				)}
			>
				{title}
			</h1>
			{description ? (
				<p className="text-primary/60 text-sm">{description}</p>
			) : null}
			<div
				className={cn(
					"mt-4 flex w-full flex-col overflow-clip rounded-md border",
					isDanger
						? "border-destructive/30 bg-destructive/5 dark:border-destructive/20"
						: "dark:bg-background-100"
				)}
			>
				{children}
			</div>
		</section>
	);
}

export function SettingsRowFooter({ children, className }: SettingsPageProps) {
	return (
		<div className={cn("border-t bg-background-100 p-4", className)}>
			{children}
		</div>
	);
}
