import { describe, expect, it } from "bun:test";
import {
	buildToolCallsByName,
	getNonFinishToolCallCount,
	getTotalToolCalls,
	mergeToolCallsByName,
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
			wait: 1,
		});

		expect(nonFinishTotal).toBe(5);
	});
});
