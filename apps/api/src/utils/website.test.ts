import { describe, expect, it } from "bun:test";
import { getMostRecentLastOnlineAt } from "./website";

describe("getMostRecentLastOnlineAt", () => {
	it("returns the latest valid timestamp", () => {
		expect(
			getMostRecentLastOnlineAt([
				{ lastSeenAt: "2026-03-01T00:00:00.000Z" },
				{ lastSeenAt: "2026-03-03T04:05:06.000Z" },
				{ lastSeenAt: "invalid-date" },
			])
		).toBe("2026-03-03T04:05:06.000Z");
	});

	it("returns null when no valid timestamps exist", () => {
		expect(
			getMostRecentLastOnlineAt([
				{ lastSeenAt: null },
				{ lastSeenAt: "not-a-date" },
			])
		).toBeNull();
	});
});
