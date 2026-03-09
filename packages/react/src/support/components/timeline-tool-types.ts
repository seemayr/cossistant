import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type React from "react";

export type ConversationTimelineToolProps = {
	item: TimelineItem;
	conversationId: string;
};

export type ConversationTimelineToolDefinition = {
	component: React.ComponentType<ConversationTimelineToolProps>;
};

export type ConversationTimelineTools = Record<
	string,
	ConversationTimelineToolDefinition
>;
