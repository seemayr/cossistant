import { Support, type SupportTriggerSlotProps } from "@cossistant/react";
import * as React from "react";

const PillBubble = React.forwardRef<HTMLButtonElement, SupportTriggerSlotProps>(
	function PillBubbleTrigger({ className, isTyping, toggle, ...props }, ref) {
		return (
			<button
				{...props}
				className={className}
				onClick={toggle}
				ref={ref}
				type="button"
			>
				{isTyping ? "Support is typing..." : "Open support"}
			</button>
		);
	}
);

export default function ExamplePillBubble() {
	return <Support slots={{ trigger: PillBubble }} />;
}
