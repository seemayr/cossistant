import { AI_AGENT_TOOL_IDS, type AiAgentToolId } from "@cossistant/types";
import { tool } from "ai";
import { z } from "zod";
import { normalizePromptDocumentName } from "./documents";
import type { ResolvedSkillPromptDocument } from "./resolver";

const TOOL_ID_SET = new Set<string>(AI_AGENT_TOOL_IDS);
const TOOL_MENTION_REGEX = /mention:tool:([^)]+)/g;

export const MAX_RUNTIME_SKILL_LOADS_PER_RUN = 8;

export type RuntimeSkillCatalogEntry = {
	name: string;
	summary: string;
};

export type RuntimeLoadedSkillDocument = {
	name: string;
	content: string;
	mentionedToolIds: AiAgentToolId[];
};

export type RuntimeLoadSkillResult = {
	found: boolean;
	name: string;
	content: string;
	mentionedToolIds: AiAgentToolId[];
	alreadyLoaded: boolean;
};

function summarizeSkillContent(content: string): string {
	const lines = content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const firstMeaningfulLine =
		lines.find((line) => !line.startsWith("#")) ?? lines[0] ?? "";
	const normalized = firstMeaningfulLine
		.replace(/^[-*]\s+/, "")
		.replace(/\s+/g, " ")
		.trim();

	if (!normalized) {
		return "No summary available.";
	}

	if (normalized.length <= 140) {
		return normalized;
	}

	return `${normalized.slice(0, 137)}...`;
}

export function extractMentionedToolIdsFromSkillContent(
	content: string
): AiAgentToolId[] {
	const matches = content.matchAll(TOOL_MENTION_REGEX);
	const toolIds = new Set<AiAgentToolId>();

	for (const match of matches) {
		const rawId = (match[1] ?? "").trim();
		if (TOOL_ID_SET.has(rawId)) {
			toolIds.add(rawId as AiAgentToolId);
		}
	}

	return Array.from(toolIds);
}

type CreateRuntimeSkillRegistryInput = {
	enabledSkills: ResolvedSkillPromptDocument[];
	maxLoadsPerRun?: number;
};

export type RuntimeSkillRegistry = {
	loadSkill: (name: string) => RuntimeLoadSkillResult;
	getLoadedSkills: () => RuntimeLoadedSkillDocument[];
	getLoadSkillCallCount: () => number;
	getCatalog: () => RuntimeSkillCatalogEntry[];
};

export function createRuntimeSkillRegistry(
	input: CreateRuntimeSkillRegistryInput
): RuntimeSkillRegistry {
	const { enabledSkills, maxLoadsPerRun = MAX_RUNTIME_SKILL_LOADS_PER_RUN } =
		input;
	const enabledSkillsByName = new Map(
		enabledSkills.map((skill) => [
			normalizePromptDocumentName(skill.name),
			skill,
		])
	);
	const loadedSkillsByName = new Map<string, RuntimeLoadedSkillDocument>();
	let loadSkillCallCount = 0;

	const catalog = enabledSkills
		.map((skill) => ({
			name: skill.name,
			summary: summarizeSkillContent(skill.content),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	return {
		loadSkill: (name: string): RuntimeLoadSkillResult => {
			loadSkillCallCount += 1;
			const normalizedName = normalizePromptDocumentName(name);
			const resolvedSkill = enabledSkillsByName.get(normalizedName);

			if (!resolvedSkill) {
				return {
					found: false,
					name: normalizedName,
					content: "",
					mentionedToolIds: [],
					alreadyLoaded: false,
				};
			}

			const alreadyLoaded = loadedSkillsByName.has(normalizedName);
			if (!alreadyLoaded && loadedSkillsByName.size >= maxLoadsPerRun) {
				return {
					found: false,
					name: normalizedName,
					content: "",
					mentionedToolIds: [],
					alreadyLoaded: false,
				};
			}

			const loadedSkill: RuntimeLoadedSkillDocument = {
				name: resolvedSkill.name,
				content: resolvedSkill.content,
				mentionedToolIds: extractMentionedToolIdsFromSkillContent(
					resolvedSkill.content
				),
			};
			loadedSkillsByName.set(normalizedName, loadedSkill);

			return {
				found: true,
				name: loadedSkill.name,
				content: loadedSkill.content,
				mentionedToolIds: [...loadedSkill.mentionedToolIds],
				alreadyLoaded,
			};
		},
		getLoadedSkills: () => Array.from(loadedSkillsByName.values()),
		getLoadSkillCallCount: () => loadSkillCallCount,
		getCatalog: () => catalog,
	};
}

type CreateLoadSkillToolInput = {
	registry: RuntimeSkillRegistry;
	conversationId: string;
};

const loadSkillInputSchema = z.object({
	name: z
		.string()
		.describe("Skill file name to load (for example: escalation-playbook.md)"),
});

export function createLoadSkillTool(input: CreateLoadSkillToolInput) {
	return tool({
		description:
			"Load the full instructions for a named skill from the agent's enabled DB skills. Use exact *.md skill names from the available skill catalog in the system prompt.",
		inputSchema: loadSkillInputSchema,
		execute: async ({ name }): Promise<RuntimeLoadSkillResult> => {
			const result = input.registry.loadSkill(name);
			if (result.found) {
				console.log(
					`[ai-agent:load-skill] conv=${input.conversationId} | loaded=${result.name} | alreadyLoaded=${result.alreadyLoaded}`
				);
			} else {
				console.log(
					`[ai-agent:load-skill] conv=${input.conversationId} | missing_or_blocked=${name}`
				);
			}
			return result;
		},
	});
}
