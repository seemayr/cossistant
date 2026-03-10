import { describe, expect, it } from "bun:test";
import { resolveConversationItemDetailTarget } from "./resolve-conversation-item-detail-target";

describe("resolveConversationItemDetailTarget", () => {
	it("prefers the contact id when the visitor is identified", () => {
		expect(
			resolveConversationItemDetailTarget({
				visitor: {
					id: "visitor-1",
					contact: {
						id: "contact-1",
					},
				},
				visitorId: "visitor-fallback",
			})
		).toEqual({
			type: "contact",
			id: "contact-1",
		});
	});

	it("falls back to the visitor id when no contact is attached", () => {
		expect(
			resolveConversationItemDetailTarget({
				headerVisitor: {
					id: "visitor-2",
					contact: null,
				},
				visitorId: "visitor-fallback",
			})
		).toEqual({
			type: "visitor",
			id: "visitor-2",
		});
	});

	it("returns null when no contact or visitor target exists", () => {
		expect(
			resolveConversationItemDetailTarget({
				headerVisitor: null,
				visitor: null,
				visitorId: null,
			})
		).toBeNull();
	});
});
