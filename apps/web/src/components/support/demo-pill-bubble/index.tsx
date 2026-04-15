"use client";

import { SupportDemoStage } from "../docs-demo/stage";
import { SupportTriggerStatePreview } from "../docs-demo/trigger-state-preview";
import { PillBubble } from "../examples/pill-bubble";

export default function SupportPillBubbleDemo() {
	return (
		<SupportDemoStage variant="bubble">
			<SupportTriggerStatePreview isTypingWhenOpen Trigger={PillBubble} />
		</SupportDemoStage>
	);
}
