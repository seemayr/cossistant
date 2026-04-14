import { Support, type SupportTriggerSlotProps } from "@cossistant/react";
import * as React from "react";

const ClassicBubble = React.forwardRef<
	HTMLButtonElement,
	SupportTriggerSlotProps
>(function ClassicBubbleTrigger(
	{ className, isOpen, unreadCount, toggle, ...props },
	ref
) {
	return (
		<button
			{...props}
			className={className}
			onClick={toggle}
			ref={ref}
			type="button"
		>
			{isOpen ? "Close" : "Chat"}
			{unreadCount > 0 ? ` (${unreadCount})` : null}
		</button>
	);
});

export default function ExampleClassicBubble() {
	return <Support slots={{ trigger: ClassicBubble }} />;
}
