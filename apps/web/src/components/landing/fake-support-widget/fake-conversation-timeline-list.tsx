"use client";

import type React from "react";
import { TestUiWidgetTimelinePreview } from "@/components/test-ui/timeline/widget-timeline-preview";

export function FakeConversationTimelineList(
	props: React.ComponentProps<typeof TestUiWidgetTimelinePreview>
) {
	return (
		<div className="cossistant">
			<TestUiWidgetTimelinePreview {...props} />
		</div>
	);
}
