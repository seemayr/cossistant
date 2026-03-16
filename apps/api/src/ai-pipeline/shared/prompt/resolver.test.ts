import { describe, expect, it } from "bun:test";
import { buildFallbackCoreDocuments } from "./resolver";

describe("buildFallbackCoreDocuments", () => {
	it("includes clarification guidance when the setting is missing", () => {
		const documents = buildFallbackCoreDocuments(
			{
				basePrompt: "You are helpful.",
				behaviorSettings: {},
			} as never,
			"respond_to_visitor"
		);

		expect(documents["behaviour.md"]).toContain(
			"## When to Request Knowledge Clarification"
		);
	});

	it("omits clarification guidance when the setting is explicitly disabled", () => {
		const documents = buildFallbackCoreDocuments(
			{
				basePrompt: "You are helpful.",
				behaviorSettings: {
					canRequestKnowledgeClarification: false,
				},
			} as never,
			"respond_to_visitor"
		);

		expect(documents["behaviour.md"]).not.toContain(
			"## When to Request Knowledge Clarification"
		);
	});
});
