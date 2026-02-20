import { describe, expect, it } from "bun:test";
import {
	AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES,
	AI_AGENT_TOOL_CATALOG,
	AI_AGENT_TOOL_IDS,
} from "@cossistant/types";
import type { AiAgentSelect } from "../db/schema/ai-agent";
import type { AiAgentPromptDocumentSelect } from "../db/schema/ai-agent-prompt-document";
import { buildCapabilitiesStudioResponse } from "./capabilities-studio";
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

	it("returns a full catalog-sized tools list with valid group/order metadata", () => {
		const response = buildCapabilitiesStudioResponse({
			aiAgent: createAgent(),
			documents: [],
		});

		expect(response.tools).toHaveLength(AI_AGENT_TOOL_CATALOG.length);
		for (const tool of response.tools) {
			expect(tool.group === "behavior" || tool.group === "actions").toBe(true);
			expect(Number.isInteger(tool.order)).toBe(true);
		}
	});

	it("returns effective tool skill content and override metadata", () => {
		const resolveTool = AI_AGENT_TOOL_CATALOG.find(
			(tool) => tool.id === "resolve"
		);
		if (!resolveTool) {
			throw new Error("Expected resolve tool in catalog");
		}

		const response = buildCapabilitiesStudioResponse({
			aiAgent: createAgent(),
			documents: [
				createDocument({
					id: "01JTESTOVERRIDE0000000000",
					name: resolveTool.defaultSkill.name,
					content: `${resolveTool.defaultSkill.content}\n\n- Extra rule`,
				}),
			],
		});

		const resolveState = response.tools.find((tool) => tool.id === "resolve");

		expect(resolveState).toBeDefined();
		expect(resolveState?.skillName).toBe(resolveTool.defaultSkill.name);
		expect(resolveState?.skillHasOverride).toBe(true);
		expect(resolveState?.skillIsCustomized).toBe(true);
		expect(resolveState?.skillDocumentId).toBe("01JTESTOVERRIDE0000000000");
		expect(resolveState?.skillContent).toContain("Extra rule");
	});

	it("exposes custom skills only and excludes tool-attached and dropped names", () => {
		const sendMessageTool = AI_AGENT_TOOL_CATALOG.find(
			(tool) => tool.id === "sendMessage"
		);
		if (!sendMessageTool) {
			throw new Error("Expected sendMessage tool in catalog");
		}
		const droppedName = AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES[0];
		if (!droppedName) {
			throw new Error("Expected dropped skill names");
		}

		const response = buildCapabilitiesStudioResponse({
			aiAgent: createAgent(),
			documents: [
				createDocument({
					id: "01JTESTTOOLSKILL00000000",
					name: sendMessageTool.defaultSkill.name,
					enabled: true,
				}),
				createDocument({
					id: "01JTESTDROPPED0000000000",
					name: droppedName,
					enabled: true,
				}),
				createDocument({
					id: "01JTESTCUSTOM00000000000",
					name: "custom-playbook.md",
					enabled: true,
				}),
			],
		});

		const customSkillNames = response.customSkillDocuments.map(
			(document) => document.name
		);

		expect(customSkillNames).toContain("custom-playbook.md");
		expect(customSkillNames).not.toContain(sendMessageTool.defaultSkill.name);
		expect(customSkillNames).not.toContain(droppedName);
	});

	it("does not return removed template/system sections", () => {
		const response = buildCapabilitiesStudioResponse({
			aiAgent: createAgent(),
			documents: [],
		});

		expect("defaultSkillTemplates" in response).toBe(false);
		expect("systemSkillDocuments" in response).toBe(false);
	});
});
