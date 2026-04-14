"use client";

import { IdentificationTimelineTool } from "@cossistant/react/support/components/timeline-identification-tool";
import { SearchKnowledgeTimelineTool } from "@cossistant/react/support/components/timeline-search-knowledge-tool";
import type { ConversationTimelineTools } from "@cossistant/react/support/components/timeline-tool-types";
import type React from "react";
import { FakeSupportProvider } from "./fake-support-context";
import { FakeSupportTextProvider } from "./fake-support-text";
import {
	TEST_UI_AVAILABLE_AI_AGENTS,
	TEST_UI_AVAILABLE_HUMAN_AGENTS,
	TEST_UI_CONVERSATION_ID,
	TEST_UI_VISITOR_ID,
} from "./fixtures";
import { TestWidgetConversationTimelineList } from "./widget-conversation-timeline-list";

export const TEST_UI_WIDGET_TIMELINE_TOOLS: ConversationTimelineTools = {
	searchKnowledgeBase: { component: SearchKnowledgeTimelineTool },
	identification: { component: IdentificationTimelineTool },
};

type TestUiWidgetTimelinePreviewProps = Omit<
	React.ComponentProps<typeof TestWidgetConversationTimelineList>,
	| "availableAIAgents"
	| "availableHumanAgents"
	| "conversationId"
	| "currentVisitorId"
	| "tools"
> & {
	availableAIAgents?: React.ComponentProps<
		typeof TestWidgetConversationTimelineList
	>["availableAIAgents"];
	availableHumanAgents?: React.ComponentProps<
		typeof TestWidgetConversationTimelineList
	>["availableHumanAgents"];
	conversationId?: string;
	currentVisitorId?: string;
	tools?: ConversationTimelineTools;
};

export function TestUiWidgetTimelinePreview({
	availableAIAgents = TEST_UI_AVAILABLE_AI_AGENTS,
	availableHumanAgents = TEST_UI_AVAILABLE_HUMAN_AGENTS,
	conversationId = TEST_UI_CONVERSATION_ID,
	currentVisitorId = TEST_UI_VISITOR_ID,
	tools = TEST_UI_WIDGET_TIMELINE_TOOLS,
	...props
}: TestUiWidgetTimelinePreviewProps) {
	return (
		<FakeSupportProvider>
			<FakeSupportTextProvider>
				<TestWidgetConversationTimelineList
					{...props}
					availableAIAgents={availableAIAgents}
					availableHumanAgents={availableHumanAgents}
					conversationId={conversationId}
					currentVisitorId={currentVisitorId}
					tools={tools}
				/>
			</FakeSupportTextProvider>
		</FakeSupportProvider>
	);
}
