import { ActivityWrapper } from "../activity-wrapper";
import type { ToolActivityProps } from "../types";

export function FallbackToolActivity({
	toolCall,
	timestamp,
	showIcon = true,
	showStateIndicator = false,
	showTerminalIndicator = true,
	icon,
}: ToolActivityProps) {
	return (
		<ActivityWrapper
			icon={icon}
			showIcon={showIcon}
			showStateIndicator={showStateIndicator}
			showTerminalIndicator={showTerminalIndicator}
			state={toolCall.state}
			text={toolCall.summaryText}
			timestamp={timestamp}
		/>
	);
}
