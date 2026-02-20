import { describe, expect, it } from "bun:test";
import {
	AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES,
	AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES,
	AI_AGENT_TOOL_CATALOG,
	AI_AGENT_TOOL_IDS,
} from "../src/api/ai-agent-capabilities";

describe("ai-agent tool-first capabilities catalog", () => {
	it("uses unique tool ids", () => {
		const ids = AI_AGENT_TOOL_CATALOG.map((tool) => tool.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(ids)).toEqual(new Set(AI_AGENT_TOOL_IDS));
	});

	it("assigns exactly one canonical default skill to each tool", () => {
		const skillNameRegex = /^[a-z0-9][a-z0-9-]{1,62}\.md$/;
		const skillNames = AI_AGENT_TOOL_CATALOG.map(
			(tool) => tool.defaultSkill.name
		);

		for (const tool of AI_AGENT_TOOL_CATALOG) {
			expect(skillNameRegex.test(tool.defaultSkill.name)).toBe(true);
			expect(tool.defaultSkill.name).toBe(
				`${tool.id.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}.md`
			);
			expect(tool.defaultSkill.label.length).toBeGreaterThan(0);
			expect(tool.defaultSkill.description.length).toBeGreaterThan(0);
			expect(tool.defaultSkill.content.length).toBeGreaterThan(0);
			expect(tool.group === "behavior" || tool.group === "actions").toBe(true);
			expect(Number.isInteger(tool.order)).toBe(true);
		}

		expect(new Set(skillNames).size).toBe(skillNames.length);
		expect(new Set(skillNames)).toEqual(
			new Set(AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES)
		);
	});

	it("keeps dropped template-era skill names out of active tool skill set", () => {
		const reservedSet = new Set(AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES);

		for (const droppedName of AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES) {
			expect(reservedSet.has(droppedName)).toBe(false);
		}
	});
});
