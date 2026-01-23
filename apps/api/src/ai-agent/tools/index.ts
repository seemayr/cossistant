/**
 * Tools Module
 *
 * Defines LLM tools that the AI agent can use during generation.
 *
 * Tool Categories:
 * 1. Context-gathering: searchKnowledgeBase - fetch info to inform response
 * 2. Side-effect: setConversationTitle, updateSentiment, setPriority - inline actions
 *
 * These tools work alongside structured output - tools do work inline,
 * while the final response is still via aiDecisionSchema.
 */

import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ToolSet } from "ai";
import { getBehaviorSettings } from "../settings";
import { createSearchKnowledgeBaseTool } from "./search-knowledge";
import { createSendMessageToVisitorTool } from "./send-message-tool";
import { createSetPriorityTool } from "./set-priority";
import { createSetConversationTitleTool } from "./set-title";
import type { ToolContext } from "./types";
import { createUpdateSentimentTool } from "./update-sentiment";

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
	// (will return empty if no knowledge is indexed)
	tools.searchKnowledgeBase = createSearchKnowledgeBaseTool(toolContext);

	// Multi-message tool - available for all agents
	// Allows natural conversational responses
	tools.sendMessageToVisitor = createSendMessageToVisitorTool(toolContext);

	return Object.keys(tools).length > 0 ? tools : undefined;
}
