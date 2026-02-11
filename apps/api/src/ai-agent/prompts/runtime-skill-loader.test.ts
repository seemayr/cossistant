import { describe, expect, it } from "bun:test";
import {
	createRuntimeSkillRegistry,
	extractMentionedToolIdsFromSkillContent,
} from "./runtime-skill-loader";

describe("runtime-skill-loader", () => {
	it("loads enabled DB skills by name", () => {
		const registry = createRuntimeSkillRegistry({
			enabledSkills: [
				{
					id: "skill_1",
					name: "deep-research.md",
					content: "Use retrieval before answers.",
					priority: 0,
				},
			],
		});

		const result = registry.loadSkill("deep-research.md");
		expect(result.found).toBe(true);
		expect(result.name).toBe("deep-research.md");
		expect(result.content).toContain("retrieval");
		expect(result.alreadyLoaded).toBe(false);
	});

	it("returns found=false for unknown skills", () => {
		const registry = createRuntimeSkillRegistry({
			enabledSkills: [],
		});

		const result = registry.loadSkill("missing-skill.md");
		expect(result.found).toBe(false);
		expect(result.content).toBe("");
		expect(result.mentionedToolIds).toEqual([]);
	});

	it("flags already loaded skills on repeated calls", () => {
		const registry = createRuntimeSkillRegistry({
			enabledSkills: [
				{
					id: "skill_1",
					name: "tone-and-voice.md",
					content: "Be concise.",
					priority: 0,
				},
			],
		});

		const first = registry.loadSkill("tone-and-voice.md");
		const second = registry.loadSkill("tone-and-voice.md");

		expect(first.found).toBe(true);
		expect(first.alreadyLoaded).toBe(false);
		expect(second.found).toBe(true);
		expect(second.alreadyLoaded).toBe(true);
		expect(registry.getLoadedSkills()).toHaveLength(1);
	});

	it("parses and validates tool mentions from markdown", () => {
		const toolIds = extractMentionedToolIdsFromSkillContent(
			[
				"Use [@Search Knowledge Base](mention:tool:searchKnowledgeBase)",
				"Then [@Send Public Message](mention:tool:sendMessage)",
				"Ignore unknown [@Bad](mention:tool:not-a-real-tool)",
			].join("\n")
		);

		expect(toolIds).toEqual(["searchKnowledgeBase", "sendMessage"]);
	});
});
