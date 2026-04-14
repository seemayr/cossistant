"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function DocsComponentPreviewTabs({
	className,
	align = "center",
	component,
	source,
	sizeClasses = "min-h-[280px] md:min-h-[360px]",
}: React.ComponentProps<"div"> & {
	align?: "center" | "start" | "end";
	component: React.ReactNode;
	source: React.ReactNode;
	sizeClasses?: string;
}) {
	const [tab, setTab] = React.useState("preview");
	const previewAlignment = {
		center: "justify-center",
		start: "justify-start",
		end: "justify-end",
	}[align];

	return (
		<div
			className={cn("mt-6 w-full min-w-0", className)}
			data-slot="docs-component-preview"
		>
			<Tabs className="relative w-full" onValueChange={setTab} value={tab}>
				<div
					className="relative min-w-0 overflow-hidden border border-border/70 border-dashed bg-background/60"
					data-slot="docs-component-preview-frame"
				>
					<div className="px-4 pt-4 pb-3">
						<TabsList className="grid w-full max-w-[220px] grid-cols-2">
							<TabsTrigger value="preview">Preview</TabsTrigger>
							<TabsTrigger value="code">Code</TabsTrigger>
						</TabsList>
					</div>
					{tab === "preview" && (
						<div
							className={cn(
								"max-h-[560px] w-full min-w-0 overflow-auto overscroll-contain bg-background px-4 py-6 md:max-h-[640px] dark:bg-background-100",
								sizeClasses
							)}
							data-slot="docs-component-preview-preview"
						>
							<div
								className={cn(
									"flex w-full min-w-0 items-center",
									previewAlignment
								)}
							>
								{component}
							</div>
						</div>
					)}
					{tab === "code" && (
						<div
							className={cn(
								"scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-background-100 max-h-[560px] w-full overflow-auto overscroll-contain px-5 py-4 md:max-h-[640px] dark:bg-background-100",
								sizeClasses
							)}
							data-slot="docs-component-preview-code"
						>
							{source}
						</div>
					)}
				</div>
			</Tabs>
		</div>
	);
}
