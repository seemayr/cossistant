import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { AiAgentPromptDocumentSelect } from "@api/db/schema/ai-agent-prompt-document";
import {
	AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES,
	AI_AGENT_TOOL_CATALOG,
} from "@cossistant/types";
import { getDefaultBehaviorSettings } from "../settings/defaults";

let mockedDocuments: AiAgentPromptDocumentSelect[] = [];

const listAiAgentPromptDocumentsMock = mock(async () => mockedDocuments);

mock.module("@api/db/queries/ai-agent-prompt-document", () => ({
	listAiAgentPromptDocuments: listAiAgentPromptDocumentsMock,
}));

const resolverModulePromise = import("./resolver");

function createAgent(
	overrides: Partial<AiAgentSelect["behaviorSettings"]> = {}
): AiAgentSelect {
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
		behaviorSettings: {
			...(getDefaultBehaviorSettings() as AiAgentSelect["behaviorSettings"]),
			...overrides,
		} as AiAgentSelect["behaviorSettings"],
		onboardingCompletedAt: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null,
	};
}

function createSkillDocument(
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

function createCoreDocument(
	overrides: Partial<AiAgentPromptDocumentSelect>
): AiAgentPromptDocumentSelect {
	return {
		id: "01JTESTCOREDOC0000000000",
		organizationId: "01JTESTORG00000000000000",
		websiteId: "01JTESTWEB00000000000000",
		aiAgentId: "01JTESTAGENT0000000000000",
		kind: "core",
		name: "decision.md",
		content: "## Decision Policy\n\nFallback decision policy",
		enabled: true,
		priority: 0,
		createdByUserId: null,
		updatedByUserId: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

describe("resolvePromptBundle", () => {
	beforeEach(() => {
		mockedDocuments = [];
		listAiAgentPromptDocumentsMock.mockClear();
	});

	it("keeps wait.md in dropped skill template names", () => {
		expect(AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES).toContain("wait.md");
	});

	it("includes tool-attached skills for runtime-enabled tools", async () => {
		const { resolvePromptBundle } = await resolverModulePromise;
		const bundle = await resolvePromptBundle({
			db: {} as never,
			aiAgent: createAgent(),
			mode: "respond_to_visitor",
		});

		const skillNames = bundle.enabledSkills.map((skill) => skill.name);
		expect(skillNames).toContain("send-message.md");
		expect(skillNames).toContain("respond.md");
		expect(skillNames).toContain("resolve.md");
		expect(skillNames).toContain("mark-spam.md");
	});

	it("excludes optional tool skills when the tool is disabled in behavior settings", async () => {
		const { resolvePromptBundle } = await resolverModulePromise;
		const bundle = await resolvePromptBundle({
			db: {} as never,
			aiAgent: createAgent({
				canResolve: false,
				canMarkSpam: false,
			}),
			mode: "respond_to_visitor",
		});

		const skillNames = bundle.enabledSkills.map((skill) => skill.name);
		expect(skillNames).not.toContain("resolve.md");
		expect(skillNames).not.toContain("mark-spam.md");
		expect(skillNames).toContain("send-message.md");
	});

	it("prefers override content for tool-attached skills", async () => {
		const resolveTool = AI_AGENT_TOOL_CATALOG.find(
			(tool) => tool.id === "resolve"
		);
		if (!resolveTool) {
			throw new Error("Expected resolve tool in catalog");
		}
		mockedDocuments = [
			createSkillDocument({
				id: "01JTESTOVERRIDE0000000000",
				name: resolveTool.defaultSkill.name,
				content: "custom resolve behavior",
				enabled: false,
			}),
		];

		const { resolvePromptBundle } = await resolverModulePromise;
		const bundle = await resolvePromptBundle({
			db: {} as never,
			aiAgent: createAgent(),
			mode: "respond_to_visitor",
		});

		const resolveSkill = bundle.enabledSkills.find(
			(skill) => skill.name === "resolve.md"
		);
		expect(resolveSkill?.content).toBe("custom resolve behavior");
		expect(resolveSkill?.source).toBe("tool");
	});

	it("loads all editable core overrides and ignores immutable core overrides", async () => {
		mockedDocuments = [
			createCoreDocument({
				id: "01JTESTBEHAVIOVERRIDE0000",
				name: "behaviour.md",
				content: "custom behaviour core document",
			}),
			createCoreDocument({
				id: "01JTESTPARTICIPATION00000",
				name: "participation.md",
				content: "custom participation core document",
			}),
			createCoreDocument({
				id: "01JTESTGROUNDING00000000",
				name: "grounding.md",
				content: "custom grounding core document",
			}),
			createCoreDocument({
				id: "01JTESTCAPABILITIES00000",
				name: "capabilities.md",
				content: "custom capabilities core document",
			}),
			createCoreDocument({
				id: "01JTESTVISITORCONTACT000",
				name: "visitor-contact.md",
				content: "custom visitor-contact core document",
			}),
			createCoreDocument({
				id: "01JTESTDECISIONOVERRIDE0000",
				name: "decision.md",
				content: "custom decision core document",
			}),
			createCoreDocument({
				id: "01JTESTAGENTOVERRIDE00000",
				name: "agent.md",
				content: "attempted agent override",
			}),
			createCoreDocument({
				id: "01JTESTSECURITYOVERRIDE0000",
				name: "security.md",
				content: "attempted security override",
			}),
		];

		const { resolvePromptBundle } = await resolverModulePromise;
		const bundle = await resolvePromptBundle({
			db: {} as never,
			aiAgent: createAgent(),
			mode: "respond_to_visitor",
		});

		expect(bundle.coreDocuments["behaviour.md"]?.content).toBe(
			"custom behaviour core document"
		);
		expect(bundle.coreDocuments["behaviour.md"]?.source).toBe("override");
		expect(bundle.coreDocuments["participation.md"]?.content).toBe(
			"custom participation core document"
		);
		expect(bundle.coreDocuments["participation.md"]?.source).toBe("override");
		expect(bundle.coreDocuments["grounding.md"]?.content).toBe(
			"custom grounding core document"
		);
		expect(bundle.coreDocuments["grounding.md"]?.source).toBe("override");
		expect(bundle.coreDocuments["capabilities.md"]?.content).toBe(
			"custom capabilities core document"
		);
		expect(bundle.coreDocuments["capabilities.md"]?.source).toBe("override");
		expect(bundle.coreDocuments["visitor-contact.md"]?.content).toBe(
			"custom visitor-contact core document"
		);
		expect(bundle.coreDocuments["visitor-contact.md"]?.source).toBe("override");
		expect(bundle.coreDocuments["decision.md"]?.content).toBe(
			"custom decision core document"
		);
		expect(bundle.coreDocuments["decision.md"]?.source).toBe("override");
		expect(bundle.coreDocuments["agent.md"]?.source).toBe("fallback");
		expect(bundle.coreDocuments["security.md"]?.source).toBe("fallback");
	});

	it("includes enabled custom skills and excludes dropped names", async () => {
		const droppedName = AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES[0];
		if (!droppedName) {
			throw new Error("Expected dropped skill names");
		}
		mockedDocuments = [
			createSkillDocument({
				id: "01JTESTDROPPED0000000000",
				name: droppedName,
				enabled: true,
			}),
			createSkillDocument({
				id: "01JTESTCUSTOMON000000000",
				name: "custom-playbook.md",
				content: "enabled custom",
				enabled: true,
				priority: 3,
			}),
			createSkillDocument({
				id: "01JTESTCUSTOMOFF00000000",
				name: "disabled-custom.md",
				content: "disabled custom",
				enabled: false,
				priority: 10,
			}),
		];

		const { resolvePromptBundle } = await resolverModulePromise;
		const bundle = await resolvePromptBundle({
			db: {} as never,
			aiAgent: createAgent(),
			mode: "respond_to_visitor",
		});

		const skillNames = bundle.enabledSkills.map((skill) => skill.name);
		expect(skillNames).toContain("custom-playbook.md");
		expect(skillNames).not.toContain("disabled-custom.md");
		expect(skillNames).not.toContain(droppedName);
	});
});
