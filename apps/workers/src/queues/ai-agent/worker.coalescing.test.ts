import { describe, expect, it } from "bun:test";
import { isTriggerableMessage } from "./coalescing";

describe("isTriggerableMessage", () => {
	it("returns true for user-authored messages", () => {
		expect(
			isTriggerableMessage({
				id: "m-1",
				userId: "user-1",
				visitorId: null,
			})
		).toBe(true);
	});

	it("returns true for visitor-authored messages", () => {
		expect(
			isTriggerableMessage({
				id: "m-2",
				userId: null,
				visitorId: "visitor-1",
			})
		).toBe(true);
	});

	it("returns false for system/non-authored messages", () => {
		expect(
			isTriggerableMessage({
				id: "m-3",
				userId: null,
				visitorId: null,
			})
		).toBe(false);
	});
});
