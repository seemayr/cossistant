"use client";

import { Support, type SupportTriggerSlotProps } from "@cossistant/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { LandingTriggerContent } from "../custom-trigger";
import { SupportDocsProvider } from "../docs-demo/provider";
import { SupportDemoStage } from "../docs-demo/stage";

const ClassicBubble = React.forwardRef<
	HTMLButtonElement,
	SupportTriggerSlotProps
>(function ClassicBubbleTrigger(
	{ className, isOpen, isTyping, unreadCount, toggle, ...props },
	ref
) {
	return (
		<button
			{...props}
			className={cn(
				"flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-1 ring-black/5 transition-transform hover:scale-[1.02]",
				className
			)}
			onClick={toggle}
			ref={ref}
			type="button"
		>
			<LandingTriggerContent
				isOpen={isOpen}
				isTyping={isTyping}
				toggle={toggle}
				unreadCount={unreadCount}
			/>
		</button>
	);
});

export default function SupportClassicBubbleDemo() {
	return (
		<SupportDocsProvider>
			<SupportDemoStage variant="bubble">
				<Support
					quickOptions={[
						"Show me the slots API",
						"Can I keep the default pages?",
						"How do I restyle the panel?",
					]}
					slots={{ trigger: ClassicBubble }}
				/>
			</SupportDemoStage>
		</SupportDocsProvider>
	);
}
