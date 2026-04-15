"use client";

import { SupportDemoStage } from "../docs-demo/stage";
import { SupportTriggerStatePreview } from "../docs-demo/trigger-state-preview";
import { ClassicBubble } from "../examples/classic-bubble";

export default function SupportClassicBubbleDemo() {
	return (
		<SupportDemoStage variant="bubble">
			<SupportTriggerStatePreview Trigger={ClassicBubble} />
		</SupportDemoStage>
	);
}
