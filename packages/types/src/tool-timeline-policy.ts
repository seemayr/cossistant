export const TOOL_TIMELINE_LOG_TYPE = {
	CUSTOMER_FACING: "customer_facing",
	LOG: "log",
	DECISION: "decision",
} as const;

export type ToolTimelineLogType =
	(typeof TOOL_TIMELINE_LOG_TYPE)[keyof typeof TOOL_TIMELINE_LOG_TYPE];

export type WidgetToolActivityPolicy = {
	timeline: boolean;
	liveStatus: boolean;
	defaultProgressMessage?: string | null;
};

export const TOOL_WIDGET_ACTIVITY_REGISTRY = {
	searchKnowledgeBase: {
		timeline: true,
		liveStatus: true,
		defaultProgressMessage: "Searching knowledge base...",
	},
} as const satisfies Record<string, WidgetToolActivityPolicy>;

const DASHBOARD_CONVERSATION_VISIBLE_TOOL_NAMES = new Set([
	"searchKnowledgeBase",
	"updateConversationTitle",
	"setConversationTitle",
	"updateSentiment",
	"setPriority",
]);

const WIDGET_TOOL_ACTIVITY_POLICIES: Record<string, WidgetToolActivityPolicy> =
	TOOL_WIDGET_ACTIVITY_REGISTRY;

export const TOOL_TIMELINE_CONVERSATION_ALLOWLIST = Object.freeze(
	Object.keys(WIDGET_TOOL_ACTIVITY_POLICIES)
) as readonly string[];

export function getWidgetToolActivityPolicy(
	toolName: string
): WidgetToolActivityPolicy | null {
	return WIDGET_TOOL_ACTIVITY_POLICIES[toolName] ?? null;
}

export function isWidgetVisibleTool(toolName: string): boolean {
	return Boolean(getWidgetToolActivityPolicy(toolName));
}

export function isWidgetTimelineTool(toolName: string): boolean {
	return getWidgetToolActivityPolicy(toolName)?.timeline === true;
}

export function isWidgetLiveStatusTool(toolName: string): boolean {
	return getWidgetToolActivityPolicy(toolName)?.liveStatus === true;
}

export function getWidgetToolDefaultProgressMessage(
	toolName: string
): string | null {
	return getWidgetToolActivityPolicy(toolName)?.defaultProgressMessage ?? null;
}

export function isConversationVisibleTool(toolName: string): boolean {
	return DASHBOARD_CONVERSATION_VISIBLE_TOOL_NAMES.has(toolName);
}

export function getToolLogType(toolName: string): ToolTimelineLogType {
	if (toolName === "aiDecision") {
		return TOOL_TIMELINE_LOG_TYPE.DECISION;
	}

	if (isConversationVisibleTool(toolName)) {
		return TOOL_TIMELINE_LOG_TYPE.CUSTOMER_FACING;
	}

	return TOOL_TIMELINE_LOG_TYPE.LOG;
}
