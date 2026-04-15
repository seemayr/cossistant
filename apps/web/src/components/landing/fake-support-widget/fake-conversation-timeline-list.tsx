"use client";

import type React from "react";
import { TestUiWidgetTimelinePreview } from "@/components/test-ui/timeline/widget-timeline-preview";
import { cn } from "@/lib/utils";

export function FakeConversationTimelineList({
	className,
	...props
}: React.ComponentProps<typeof TestUiWidgetTimelinePreview>) {
	return (
		<div className="cossistant h-full min-h-0 w-full">
			<TestUiWidgetTimelinePreview
				{...props}
				className={cn("h-full min-h-0", className)}
			/>
		</div>
	);
}
