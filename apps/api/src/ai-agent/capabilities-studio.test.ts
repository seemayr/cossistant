import { describe, expect, it } from "bun:test";
import {
	AI_AGENT_DEFAULT_SKILL_TEMPLATES,
	AI_AGENT_TOOL_IDS,
} from "@cossistant/types";
import type { AiAgentSelect } from "../db/schema/ai-agent";
import type { AiAgentPromptDocumentSelect } from "../db/schema/ai-agent-prompt-document";
import { buildCapabilitiesStudioResponse } from "./capabilities-studio";
import type { ResolvedPromptBundle } from "./prompts/resolver";
import { getDefaultBehaviorSettings } from "./settings/defaults";

function createAgent(
	overrides: Partial<AiAgentSelect["behaviorSettings"]> = {}
): AiAgentSelect {
	const behaviorSettings = {
		...(getDefaultBehaviorSettings() as AiAgentSelect["behaviorSettings"]),
		...overrides,
	} as AiAgentSelect["behaviorSettings"];

	return {
		id: "01JTESTAGENT0000000000000",
		name: "Agent",
		description: null,
		basePrompt: "You are helpful.",
		model: "openai/gpt-5-mini",
		temperature: 0.7,
		maxOutputTokens: 1024,
		organizationId: "01JTESTORG00000000000000",
		websiteId: "01JTESTWEB00000000000000",
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

function createPromptBundle(): ResolvedPromptBundle {
	return {
		coreDocuments: {
			"agent.md": {
				name: "agent.md",
				content: "fallback agent",
				source: "fallback",
				priority: 0,
			},
			"security.md": {
				name: "security.md",
				content: "fallback security",
				source: "fallback",
				priority: 0,
			},
			"behaviour.md": {
				name: "behaviour.md",
				content: "fallback behaviour",
				source: "fallback",
				priority: 0,
			},
			"participation.md": {
				name: "participation.md",
				content: "fallback participation",
				source: "fallback",
				priority: 0,
			},
			"grounding.md": {
				name: "grounding.md",
				content: "fallback grounding",
				source: "fallback",
				priority: 0,
			},
			"capabilities.md": {
				name: "capabilities.md",
				content: "fallback capabilities",
				source: "fallback",
				priority: 0,
			},
		},
		enabledSkills: [],
	};
}

function createDocument(
	overrides: Partial<AiAgentPromptDocumentSelect>
): AiAgentPromptDocumentSelect {
	return {
		id: "01JTESTDOC000000000000000",
		organizationId: "01JTESTORG00000000000000",
		websiteId: "01JTESTWEB00000000000000",
		aiAgentId: "01JTESTAGENT0000000000000",
		kind: "skill",
		name: "custom-skill.md",
		content: "custom content",
		enabled: true,
		priority: 0,
		createdByUserId: null,
		updatedByUserId: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

describe("buildCapabilitiesStudioResponse", () => {
	it("maps behavior settings to runtime tool enabled state", () => {
		const response = buildCapabilitiesStudioResponse({
			aiAgent: createAgent({
				canResolve: false,
				canMarkSpam: false,
				canEscalate: false,
				canSetPriority: false,
				autoGenerateTitle: false,
				autoAnalyzeSentiment: false,
			}),
			documents: [],
			promptBundle: createPromptBundle(),
		});

		const toolsById = new Map(response.tools.map((tool) => [tool.id, tool]));

		expect(toolsById.get("resolve")?.enabled).toBe(false);
		expect(toolsById.get("markSpam")?.enabled).toBe(false);
		expect(toolsById.get("escalate")?.enabled).toBe(false);
		expect(toolsById.get("setPriority")?.enabled).toBe(false);
		expect(toolsById.get("updateConversationTitle")?.enabled).toBe(false);
		expect(toolsById.get("updateSentiment")?.enabled).toBe(false);

		for (const toolId of AI_AGENT_TOOL_IDS) {
			expect(toolsById.has(toolId)).toBe(true);
		}
	});

	it("uses resolved fallback content while preserving disabled core doc metadata", () => {
		const response = buildCapabilitiesStudioResponse({
			aiAgent: createAgent(),
			documents: [
				createDocument({
					id: "01JTESTCOREDOC00000000000",
					kind: "core",
					name: "agent.md",
					content: "db core content",
					enabled: false,
					priority: 12,
				}),
			],
			promptBundle: createPromptBundle(),
		});

		const agentSystemSkill = response.systemSkillDocuments.find(
			(skill) => skill.name === "agent.md"
		);

		expect(agentSystemSkill).toBeDefined();
		expect(agentSystemSkill?.content).toBe("fallback agent");
		expect(agentSystemSkill?.source).toBe("fallback");
		expect(agentSystemSkill?.enabled).toBe(false);
		expect(agentSystemSkill?.priority).toBe(12);
		expect(agentSystemSkill?.documentId).toBe("01JTESTCOREDOC00000000000");
	});

	it("marks template overrides and customization state from skill documents", () => {
		const template = AI_AGENT_DEFAULT_SKILL_TEMPLATES[0];
		if (!template) {
			throw new Error("Expected at least one default template");
		}

		const response = buildCapabilitiesStudioResponse({
			aiAgent: createAgent(),
			documents: [
				createDocument({
					id: "01JTESTSKILLOVERRIDE00000",
					kind: "skill",
					name: template.name,
					content: `${template.content}\n\n- Extra customization`,
					enabled: true,
				}),
			],
			promptBundle: createPromptBundle(),
		});

		const templateState = response.defaultSkillTemplates.find(
			(skill) => skill.name === template.name
		);

		expect(templateState).toBeDefined();
		expect(templateState?.hasOverride).toBe(true);
		expect(templateState?.isEnabled).toBe(true);
		expect(templateState?.isCustomized).toBe(true);
		expect(templateState?.skillDocumentId).toBe("01JTESTSKILLOVERRIDE00000");
	});
});
