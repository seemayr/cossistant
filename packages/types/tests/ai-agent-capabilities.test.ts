import { describe, expect, it } from "bun:test";
import {
	AI_AGENT_DEFAULT_SKILL_TEMPLATES,
	AI_AGENT_TOOL_CATALOG,
	AI_AGENT_TOOL_IDS,
} from "../src/api/ai-agent-capabilities";

describe("ai-agent capabilities catalog", () => {
	it("uses unique tool ids", () => {
		const ids = AI_AGENT_TOOL_CATALOG.map((tool) => tool.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(ids)).toEqual(new Set(AI_AGENT_TOOL_IDS));
	});

	it("maps tool template names to existing templates", () => {
		const templateNames = new Set(
			AI_AGENT_DEFAULT_SKILL_TEMPLATES.map((template) => template.name)
		);

		for (const tool of AI_AGENT_TOOL_CATALOG) {
			for (const templateName of tool.defaultTemplateNames) {
				expect(templateNames.has(templateName)).toBe(true);
			}
		}
	});

	it("validates template naming and suggested tool references", () => {
		const toolIds = new Set(AI_AGENT_TOOL_IDS);
		const skillNameRegex = /^[a-z0-9][a-z0-9-]{1,62}\.md$/;

		for (const template of AI_AGENT_DEFAULT_SKILL_TEMPLATES) {
			expect(skillNameRegex.test(template.name)).toBe(true);
			for (const toolId of template.suggestedToolIds) {
				expect(toolIds.has(toolId)).toBe(true);
			}
		}
	});
});
