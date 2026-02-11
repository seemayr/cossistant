import { afterAll, describe, expect, it, mock } from "bun:test";
import { AI_AGENT_TOOL_IDS } from "@cossistant/types";
import type { AiAgentSelect } from "../../db/schema/ai-agent";
import { getDefaultBehaviorSettings } from "../settings/defaults";
import type { ToolContext } from "./types";

mock.module("./tool-call-logger", () => ({
	wrapToolsWithTimelineLogging: <T>(tools: T) => tools,
}));

const toolsModulePromise = import("./index.ts?tool-index-test");

function createAgent(
	overrides: Partial<AiAgentSelect["behaviorSettings"]> = {}
): AiAgentSelect {
	const behaviorSettings = {
		...(getDefaultBehaviorSettings() as AiAgentSelect["behaviorSettings"]),
		...overrides,
	} as AiAgentSelect["behaviorSettings"];

	return {
		id: "agent_01",
		name: "Agent",
		description: null,
		basePrompt: "You are helpful.",
		model: "openai/gpt-5-mini",
		temperature: 0.7,
		maxOutputTokens: 1024,
		organizationId: "org_01",
		websiteId: "web_01",
		isActive: true,
		lastUsedAt: null,
		lastTrainedAt: null,
		trainingStatus: "idle",
		trainingProgress: 0,
		trainingError: null,
		trainingStartedAt: null,
		trainedItemsCount: null,
		usageCount: 0,
		goals: null,
		metadata: null,
		behaviorSettings,
		onboardingCompletedAt: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null,
	};
}

function createContext(allowPublicMessages: boolean): ToolContext {
	return {
		db: {} as ToolContext["db"],
		conversation: {} as ToolContext["conversation"],
		conversationId: "conv_01",
		organizationId: "org_01",
		websiteId: "web_01",
		visitorId: "visitor_01",
		aiAgentId: "agent_01",
		allowPublicMessages,
		triggerMessageId: "msg_01",
	};
}

describe("getToolsForGeneration", () => {
	afterAll(() => {
		mock.restore();
	});

	it("returns tools that align with the shared catalog ids", async () => {
		const { getToolsForGeneration } = await toolsModulePromise;
		const tools = getToolsForGeneration(
			createAgent(),
			createContext(true)
		) as Record<string, unknown>;

		expect(tools).toBeDefined();

		const catalogIds = new Set(AI_AGENT_TOOL_IDS);
		for (const key of Object.keys(tools)) {
			expect(catalogIds.has(key as (typeof AI_AGENT_TOOL_IDS)[number])).toBe(
				true
			);
		}
	});

	it("respects behavior toggle mappings", async () => {
		const { getToolsForGeneration } = await toolsModulePromise;
		const tools = getToolsForGeneration(
			createAgent({
				canResolve: false,
				canMarkSpam: false,
				canEscalate: false,
				canSetPriority: false,
				autoGenerateTitle: false,
				autoAnalyzeSentiment: false,
			}),
			createContext(true)
		) as Record<string, unknown>;

		expect(tools.resolve).toBeUndefined();
		expect(tools.markSpam).toBeUndefined();
		expect(tools.escalate).toBeUndefined();
		expect(tools.setPriority).toBeUndefined();
		expect(tools.updateConversationTitle).toBeUndefined();
		expect(tools.updateSentiment).toBeUndefined();
		expect(tools.searchKnowledgeBase).toBeDefined();
		expect(tools.identifyVisitor).toBeDefined();
		expect(tools.sendMessage).toBeDefined();
		expect(tools.sendPrivateMessage).toBeDefined();
		expect(tools.respond).toBeDefined();
		expect(tools.skip).toBeDefined();
	});

	it("keeps sendMessage available even when public messaging is disabled", async () => {
		const { getToolsForGeneration } = await toolsModulePromise;
		const tools = getToolsForGeneration(
			createAgent(),
			createContext(false)
		) as Record<string, unknown>;

		expect(tools.sendMessage).toBeDefined();
		expect(tools.sendPrivateMessage).toBeDefined();
	});
});
