/**
 * Tools Module
 *
 * Defines LLM tools that the AI agent can use during generation.
 *
 * Tool Categories:
 * 1. Messaging: sendMessage, sendPrivateMessage - how AI communicates
 * 2. Actions: respond, escalate, resolve, markSpam, skip - signal completion
 * 3. Context-gathering: searchKnowledgeBase - fetch info to inform response
 * 4. Side-effect: setConversationTitle, updateSentiment, setPriority - inline actions
 *
 * The AI MUST use tools for everything - there's no structured output.
 */

import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ToolSet } from "ai";
import { getBehaviorSettings } from "../settings";
import {
	createEscalateTool,
	createMarkSpamTool,
	createResolveTool,
	createRespondTool,
	createSkipTool,
} from "./action-tools";
import { createSearchKnowledgeBaseTool } from "./search-knowledge";
import { createSendMessageTool } from "./send-message-tool";
import { createSendPrivateMessageTool } from "./send-private-message-tool";
import { createSetPriorityTool } from "./set-priority";
import { createSetConversationTitleTool } from "./set-title";
import type { ToolContext } from "./types";
import { createUpdateSentimentTool } from "./update-sentiment";

export { getCapturedAction, resetCapturedAction } from "./action-tools";
export type { ToolContext, ToolResult } from "./types";

/**
 * Get tools for the generation step based on agent settings
 *
 * Returns tools that the AI can use during generation:
 * - Side-effect tools are always available (based on settings)
 * - Context-gathering tools are available when configured
 *
 * Tools are created with bound context so they can access the database
 * and conversation state during execution.
 */
export function getToolsForGeneration(
	aiAgent: AiAgentSelect,
	toolContext: ToolContext
): ToolSet | undefined {
	const settings = getBehaviorSettings(aiAgent);
	const tools: ToolSet = {};

	// Side-effect tools - inline actions the AI can take

	// Title tool - available if auto-generate title is enabled
	if (settings.autoGenerateTitle) {
		tools.setConversationTitle = createSetConversationTitleTool(toolContext);
	}

	// Sentiment tool - available if auto-analyze is enabled
	if (settings.autoAnalyzeSentiment) {
		tools.updateSentiment = createUpdateSentimentTool(toolContext);
	}

	// Priority tool - available if agent can set priority
	if (settings.canSetPriority) {
		tools.setPriority = createSetPriorityTool(toolContext);
	}

	// Context-gathering tools

	// Knowledge base search - available for all agents
	tools.searchKnowledgeBase = createSearchKnowledgeBaseTool(toolContext);

	// Messaging tools - ALWAYS available
	// These are the primary way the AI communicates
	tools.sendMessage = createSendMessageTool(toolContext);
	tools.sendPrivateMessage = createSendPrivateMessageTool(toolContext);

	// Action tools - AI MUST call one to signal completion
	// These replace structured output to force tool usage
	tools.respond = createRespondTool();
	tools.escalate = createEscalateTool();
	tools.resolve = createResolveTool();
	tools.markSpam = createMarkSpamTool();
	tools.skip = createSkipTool();

	return Object.keys(tools).length > 0 ? tools : undefined;
}
