import { describe, expect, it } from "bun:test";
import { detectAiTag, stripLeadingTag } from "./tag-detection";

describe("detectAiTag", () => {
	it("detects markdown mention by ai agent id", () => {
		const result = detectAiTag({
			message: {
				messageId: "msg-1",
				content: "[@Agent One](mention:ai-agent:ai-123) can you help?",
				senderType: "human_agent",
				senderId: "user-1",
				senderName: "Support Agent",
				timestamp: null,
				visibility: "private",
			},
			aiAgent: {
				id: "ai-123",
				name: "Agent One",
			},
		});

		expect(result).toEqual({
			tagged: true,
			source: "markdown",
			cleanedText: "@Agent One can you help?",
		});
	});

	it("detects plain text mention with punctuation and spacing variation", () => {
		const result = detectAiTag({
			message: {
				messageId: "msg-2",
				content: "@agentone, please respond to the visitor",
				senderType: "human_agent",
				senderId: "user-1",
				senderName: "Support Agent",
				timestamp: null,
				visibility: "private",
			},
			aiAgent: {
				id: "ai-123",
				name: "Agent One",
			},
		});

		expect(result.tagged).toBe(true);
		expect(result.source).toBe("text");
	});
});

describe("stripLeadingTag", () => {
	it("strips matching leading mention and returns command", () => {
		expect(
			stripLeadingTag("@Agent One draft a follow-up message", "Agent One")
		).toBe("draft a follow-up message");
	});

	it("keeps original text when mention does not match ai agent", () => {
		expect(
			stripLeadingTag("@Different Agent draft a follow-up message", "Agent One")
		).toBe("@Different Agent draft a follow-up message");
	});
});
