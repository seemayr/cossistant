import { describe, expect, it } from "bun:test";
import { AI_AGENT_TOOL_CATALOG } from "@cossistant/types";
import {
	buildRuntimeCustomSkillCatalog,
	buildRuntimeSkillDocuments,
	buildToolCallsByName,
	buildUsedCustomSkillUsage,
	getNonFinishToolCallCount,
	getTotalToolCalls,
	mergeToolCallsByName,
	selectSkillsForPrompt,
} from "./3-generation";

describe("generation tool call accounting", () => {
	it("builds per-tool counts from tool call list", () => {
		const counts = buildToolCallsByName([
			{ toolName: "sendMessage" },
			{ toolName: "searchKnowledgeBase" },
			{ toolName: "searchKnowledgeBase" },
			{ toolName: "respond" },
			{},
			{ toolName: "" },
		]);

		expect(counts).toEqual({
			sendMessage: 1,
			searchKnowledgeBase: 2,
			respond: 1,
		});
	});

	it("sums total tool calls from per-tool map", () => {
		const total = getTotalToolCalls({
			sendMessage: 2,
			searchKnowledgeBase: 3,
			respond: 1,
		});

		expect(total).toBe(6);
	});

	it("merges tool call maps from main and repair attempts", () => {
		const combined = mergeToolCallsByName(
			{
				sendMessage: 1,
				searchKnowledgeBase: 2,
			},
			{
				sendMessage: 1,
				respond: 1,
			}
		);

		expect(combined).toEqual({
			sendMessage: 2,
			searchKnowledgeBase: 2,
			respond: 1,
		});
		expect(getTotalToolCalls(combined)).toBe(5);
	});

	it("counts non-finish calls while excluding finish actions", () => {
		const nonFinishTotal = getNonFinishToolCallCount({
			searchKnowledgeBase: 2,
			sendMessage: 2,
			sendPrivateMessage: 1,
			respond: 1,
		});

		expect(nonFinishTotal).toBe(5);
	});

	it("includes tool-attached skills and caps custom skills deterministically", () => {
		const selected = selectSkillsForPrompt({
			enabledSkills: [
				{
					id: "tool:send-message.md",
					name: "send-message.md",
					content: "tool send message",
					priority: 1,
					source: "tool",
				},
				{
					id: "custom:mid.md",
					name: "mid.md",
					content: "custom mid",
					priority: 5,
					source: "custom",
				},
				{
					id: "custom:high.md",
					name: "high.md",
					content: "custom high",
					priority: 10,
					source: "custom",
				},
				{
					id: "custom:low.md",
					name: "low.md",
					content: "custom low",
					priority: 1,
					source: "custom",
				},
			],
			maxCustomSkills: 2,
		});

		expect(selected.map((skill) => skill.name)).toEqual([
			"send-message.md",
			"high.md",
			"mid.md",
		]);
	});

	it("always includes active runtime tool skills with fallback content", () => {
		const resolveTool = AI_AGENT_TOOL_CATALOG.find(
			(tool) => tool.id === "resolve"
		);
		if (!resolveTool) {
			throw new Error("Expected resolve tool in catalog");
		}

		const selected = buildRuntimeSkillDocuments({
			enabledSkills: [
				{
					id: "tool:send-message.md",
					name: "send-message.md",
					content: "override send guidance",
					priority: 6,
					source: "tool",
				},
				{
					id: "custom:high.md",
					name: "high.md",
					content: "custom high",
					priority: 10,
					source: "custom",
				},
				{
					id: "custom:mid.md",
					name: "mid.md",
					content: "custom mid",
					priority: 5,
					source: "custom",
				},
			],
			runtimeToolIds: ["sendMessage", "respond", "resolve"],
			maxCustomSkills: 1,
		});

		const byName = new Map(selected.map((skill) => [skill.name, skill]));

		expect(selected.map((skill) => skill.name)).toEqual([
			"send-message.md",
			"respond.md",
			"resolve.md",
			"high.md",
		]);
		expect(byName.get("send-message.md")?.content).toBe(
			"override send guidance"
		);
		expect(byName.get("resolve.md")?.content).toBe(
			resolveTool.defaultSkill.content
		);
		expect(byName.get("high.md")?.source).toBe("custom");
	});

	it("tracks only loaded custom skills as usage", () => {
		const catalog = buildRuntimeCustomSkillCatalog({
			enabledSkills: [
				{
					id: "custom:returns.md",
					name: "returns.md",
					content:
						"---\nname: returns-playbook\ndescription: Handle return and exchange workflows.\n---\n\nUse this for return policy questions.",
					priority: 8,
					source: "custom",
				},
				{
					id: "custom:high.md",
					name: "high.md",
					content: "custom high",
					priority: 10,
					source: "custom",
				},
				{
					id: "custom:mid.md",
					name: "mid.md",
					content: "custom mid",
					priority: 5,
					source: "custom",
				},
			],
		});

		const usedCustomSkills = buildUsedCustomSkillUsage({
			customSkillCatalog: catalog,
			loadedCustomSkillFileNames: new Set(["returns.md", "missing.md"]),
		});

		expect(usedCustomSkills).toEqual([
			{
				name: "returns.md",
				description: "Handle return and exchange workflows.",
			},
		]);
	});
});
