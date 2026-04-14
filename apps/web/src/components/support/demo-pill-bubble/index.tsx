"use client";

import { Support, type SupportTriggerSlotProps } from "@cossistant/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { DashboardTriggerContent } from "../custom-trigger";
import { SupportDocsProvider } from "../docs-demo/provider";
import { SupportDemoStage } from "../docs-demo/stage";

const PillBubble = React.forwardRef<HTMLButtonElement, SupportTriggerSlotProps>(
	function PillBubbleTrigger(
		{ className, isOpen, isTyping, unreadCount, toggle, ...props },
		ref
	) {
		return (
			<button
				{...props}
				className={cn(
					"flex h-12 items-center gap-2 rounded-full bg-background px-4 text-primary shadow-xl ring-1 ring-border transition-transform hover:scale-[1.01]",
					className
				)}
				onClick={toggle}
				ref={ref}
				type="button"
			>
				<DashboardTriggerContent
					isOpen={isOpen}
					isTyping={isTyping}
					toggle={toggle}
					unreadCount={unreadCount}
				/>
			</button>
		);
	}
);

export default function SupportPillBubbleDemo() {
	return (
		<SupportDocsProvider>
			<SupportDemoStage variant="bubble">
				<Support
					quickOptions={[
						"Open support",
						"How do I add a custom home page?",
						"Can I replace the composer too?",
					]}
					slots={{ trigger: PillBubble }}
				/>
			</SupportDemoStage>
		</SupportDocsProvider>
	);
}
