import type React from "react";
import type { ToolActivityProps } from "../types";
import { AiCreditUsageActivity } from "./ai-credit-usage";
import { SearchKnowledgeBaseActivity } from "./search-knowledge-base";
import { SetPriorityActivity } from "./set-priority";
import { UpdateConversationTitleActivity } from "./update-conversation-title";
import { UpdateSentimentActivity } from "./update-sentiment";

export { DeveloperToolView } from "./developer-tool-view";
export { FallbackToolActivity } from "./fallback-tool";

export const TOOL_RENDERER_MAP: Record<
	string,
	React.ComponentType<ToolActivityProps>
> = {
	searchKnowledgeBase: SearchKnowledgeBaseActivity,
	updateConversationTitle: UpdateConversationTitleActivity,
	setConversationTitle: UpdateConversationTitleActivity,
	updateSentiment: UpdateSentimentActivity,
	setPriority: SetPriorityActivity,
	aiCreditUsage: AiCreditUsageActivity,
	generationUsage: AiCreditUsageActivity,
};
