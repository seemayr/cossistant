import { describe, expect, it } from "bun:test";
import { parseEnabledFlag } from "@api/lib/env-flags";

describe("parseEnabledFlag", () => {
	it("defaults to enabled when the env var is missing", () => {
		expect(parseEnabledFlag(undefined, true)).toBe(true);
	});

	it("returns true only for the literal true string", () => {
		expect(parseEnabledFlag("true", true)).toBe(true);
		expect(parseEnabledFlag("false", true)).toBe(false);
		expect(parseEnabledFlag("1", true)).toBe(false);
		expect(parseEnabledFlag("yes", true)).toBe(false);
	});

	it("supports false defaults for opt-in flags", () => {
		expect(parseEnabledFlag(undefined, false)).toBe(false);
		expect(parseEnabledFlag("true", false)).toBe(true);
	});
});
