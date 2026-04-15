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
			facehashName: "Jane Doe",
			facehashSeed: "Jane Doe",
			normalizedName: "Jane Doe",
		});
	});

	it("uses email as the public Facehash name when the display name is missing", () => {
		expect(
			resolveHumanAgentDisplay(
				{ id: "agent-1", name: "   ", email: " jane@example.com " },
				{ surface: "public" }
			)
		).toEqual({
			displayName: "Support team",
			facehashName: "jane@example.com",
			facehashSeed: "jane@example.com",
			normalizedName: null,
		});
	});

	it("uses the internal fallback label as Facehash name without a name or email", () => {
		expect(
			resolveHumanAgentDisplay(
				{ id: "agent-2", name: null },
				{ surface: "internal" }
			)
		).toEqual({
			displayName: "Team member",
			facehashName: "Team member",
			facehashSeed: "Team member",
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
			facehashName: "Support",
			facehashSeed: "Support",
			normalizedName: null,
		});
	});

	it("uses matching fallback labels as matching Facehash names", () => {
		const first = resolveHumanAgentDisplay(
			{ id: "agent-1", name: "" },
			{ surface: "internal" }
		);
		const second = resolveHumanAgentDisplay(
			{ id: "agent-2", name: "" },
			{ surface: "internal" }
		);

		expect(first.displayName).toBe(second.displayName);
		expect(first.facehashName).toBe(second.facehashName);
	});
});
