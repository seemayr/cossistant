import { describe, expect, it } from "bun:test";
import {
	normalizeHumanAgentName,
	resolveHumanAgentDisplay,
} from "./human-agent-display";

describe("normalizeHumanAgentName", () => {
	it("returns null for nullish and blank values", () => {
		expect(normalizeHumanAgentName(null)).toBeNull();
		expect(normalizeHumanAgentName(undefined)).toBeNull();
		expect(normalizeHumanAgentName("")).toBeNull();
		expect(normalizeHumanAgentName("   ")).toBeNull();
	});

	it("trims valid names", () => {
		expect(normalizeHumanAgentName("  Jane Doe  ")).toBe("Jane Doe");
	});
});

describe("resolveHumanAgentDisplay", () => {
	it("uses the normalized name when present", () => {
		expect(
			resolveHumanAgentDisplay(
				{ id: "agent-1", name: "  Jane Doe  " },
				{ surface: "public" }
			)
		).toEqual({
			displayName: "Jane Doe",
			facehashSeed: "Jane Doe",
			normalizedName: "Jane Doe",
		});
	});

	it("uses the public fallback label and a stable synthetic seed", () => {
		expect(
			resolveHumanAgentDisplay(
				{ id: "agent-1", name: "   " },
				{ surface: "public" }
			)
		).toEqual({
			displayName: "Support team",
			facehashSeed: "public:agent-1",
			normalizedName: null,
		});
	});

	it("uses the internal fallback label and a stable synthetic seed", () => {
		expect(
			resolveHumanAgentDisplay(
				{ id: "agent-2", name: null },
				{ surface: "internal" }
			)
		).toEqual({
			displayName: "Team member",
			facehashSeed: "internal:agent-2",
			normalizedName: null,
		});
	});

	it("lets callers override fallback labels", () => {
		expect(
			resolveHumanAgentDisplay(
				{ id: "agent-3", name: null },
				{
					surface: "public",
					publicFallbackLabel: "Support",
				}
			)
		).toEqual({
			displayName: "Support",
			facehashSeed: "public:agent-3",
			normalizedName: null,
		});
	});

	it("keeps fallback seeds unique even when labels match", () => {
		const first = resolveHumanAgentDisplay(
			{ id: "agent-1", name: "" },
			{ surface: "internal" }
		);
		const second = resolveHumanAgentDisplay(
			{ id: "agent-2", name: "" },
			{ surface: "internal" }
		);

		expect(first.displayName).toBe(second.displayName);
		expect(first.facehashSeed).not.toBe(second.facehashSeed);
	});
});
