/**
 * Tools Module
 *
 * Defines LLM tools that the AI agent can use during generation.
 *
 * Tool Categories:
 * 1. Messaging: sendMessage, sendPrivateMessage - how AI communicates
 * 2. Actions: respond, escalate, resolve, markSpam, skip - signal completion
 * 3. Context-gathering: searchKnowledgeBase - fetch info to inform response
 * 4. Side-effect: updateConversationTitle, updateSentiment, setPriority - inline actions
 *
 * The AI MUST use tools for everything - there's no structured output.
 */

import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import {
	AI_AGENT_TOOL_CATALOG,
	type AiAgentBehaviorSettingKey,
	type AiAgentToolId,
} from "@cossistant/types";
import type { ToolSet } from "ai";
import type { AiAgentBehaviorSettings } from "../settings";
import { getBehaviorSettings } from "../settings";
import {
	createEscalateTool,
	createMarkSpamTool,
	createResolveTool,
	createRespondTool,
	createSkipTool,
} from "./action-tools";
import { createIdentifyVisitorTool } from "./identify-visitor";
import { createSearchKnowledgeBaseTool } from "./search-knowledge";
import { createSendMessageTool } from "./send-message-tool";
import { createSendPrivateMessageTool } from "./send-private-message-tool";
import { createSetPriorityTool } from "./set-priority";
import { createUpdateConversationTitleTool } from "./set-title";
import { wrapToolsWithTimelineLogging } from "./tool-call-logger";
import type { ToolContext } from "./types";
import { createUpdateSentimentTool } from "./update-sentiment";

export {
	createActionCapture,
	getCapturedAction,
	resetCapturedAction,
} from "./action-tools";
export type { ToolContext, ToolResult } from "./types";

const TOOL_CATALOG_MAP = new Map(
	AI_AGENT_TOOL_CATALOG.map((tool) => [tool.id, tool])
);

const TOOL_FACTORIES: Record<
	AiAgentToolId,
	(context: ToolContext) => ToolSet[string] | null
> = {
	searchKnowledgeBase: (context) => createSearchKnowledgeBaseTool(context),
	identifyVisitor: (context) => createIdentifyVisitorTool(context),
	updateConversationTitle: (context) =>
		createUpdateConversationTitleTool(context),
	updateSentiment: (context) => createUpdateSentimentTool(context),
	setPriority: (context) => createSetPriorityTool(context),
	sendMessage: (context) => createSendMessageTool(context),
	sendPrivateMessage: (context) => createSendPrivateMessageTool(context),
	respond: (context) => createRespondTool(context),
	escalate: (context) => createEscalateTool(context),
	resolve: (context) => createResolveTool(context),
	markSpam: (context) => createMarkSpamTool(context),
	skip: (context) => createSkipTool(context),
};

function getBehaviorSettingValue(
	settings: AiAgentBehaviorSettings,
	key: AiAgentBehaviorSettingKey
): boolean {
	switch (key) {
		case "autoAnalyzeSentiment":
			return settings.autoAnalyzeSentiment;
		case "autoGenerateTitle":
			return settings.autoGenerateTitle;
		case "canEscalate":
			return settings.canEscalate;
		case "canMarkSpam":
			return settings.canMarkSpam;
		case "canResolve":
			return settings.canResolve;
		case "canSetPriority":
			return settings.canSetPriority;
		default:
			return false;
	}
}

function isToolEnabledBySettings(
	toolId: AiAgentToolId,
	settings: AiAgentBehaviorSettings
): boolean {
	const metadata = TOOL_CATALOG_MAP.get(toolId);
	if (!metadata) {
		return false;
	}

	if (!(metadata.isToggleable && metadata.behaviorSettingKey)) {
		return true;
	}

	return getBehaviorSettingValue(settings, metadata.behaviorSettingKey);
}

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

	for (const tool of AI_AGENT_TOOL_CATALOG) {
		if (!isToolEnabledBySettings(tool.id, settings)) {
			continue;
		}

		const factory = TOOL_FACTORIES[tool.id];
		const resolvedTool = factory?.(toolContext);

		if (!resolvedTool) {
			continue;
		}

		tools[tool.id] = resolvedTool;
	}

	if (Object.keys(tools).length === 0) {
		return;
	}

	return wrapToolsWithTimelineLogging(tools, toolContext);
}

/**
 * Get a minimal toolset for repair mode.
 *
 * Only includes the tools required to send a public message and finish.
 */
export function getRepairTools(toolContext: ToolContext): ToolSet | undefined {
	const tools: ToolSet = {};

	if (toolContext.allowPublicMessages) {
		tools.sendMessage = createSendMessageTool(toolContext);
		tools.respond = createRespondTool(toolContext);
	}

	if (Object.keys(tools).length === 0) {
		return;
	}

	return wrapToolsWithTimelineLogging(tools, toolContext);
}
