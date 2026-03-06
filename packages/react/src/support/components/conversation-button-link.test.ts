import { describe, expect, it } from "bun:test";

import type { SupportTextResolvedFormatter } from "../text/locales/keys";
import { resolveConversationButtonPreviewSelection } from "./conversation-button-link";

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: string, variables?: Record<string, string>) => {
		switch (key) {
			case "component.conversationButtonLink.lastMessage.visitor":
				return `You - ${variables?.time ?? ""}`;
			case "component.conversationButtonLink.lastMessage.agent":
				return `${variables?.name ?? ""} - ${variables?.time ?? ""}`;
			case "common.fallbacks.unknown":
				return "Unknown";
			default:
				throw new Error(`Unexpected text key: ${key}`);
		}
	}) as SupportTextResolvedFormatter;
}

describe("resolveConversationButtonPreviewSelection", () => {
	const text = createTextFormatter();

	it("uses visitor metadata when the title and message preview are identical", () => {
		const result = resolveConversationButtonPreviewSelection({
			title: "Need help with billing",
			lastMessage: {
				content: "Need help with billing",
				time: "2m",
				isFromVisitor: true,
				senderName: "You",
			},
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			subtitle: "You - 2m",
			showTyping: false,
		});
	});

	it("keeps the last message when it differs from the title", () => {
		const result = resolveConversationButtonPreviewSelection({
			title: "Billing issue",
			lastMessage: {
				content: "Can you help me with my invoice?",
				time: "5m",
				isFromVisitor: true,
				senderName: "You",
			},
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			subtitle: "Can you help me with my invoice?",
			showTyping: false,
		});
	});

	it("normalizes whitespace before deciding content is duplicated", () => {
		const result = resolveConversationButtonPreviewSelection({
			title: "Need   help   with billing",
			lastMessage: {
				content: "Need help with billing",
				time: "1h",
				isFromVisitor: false,
				senderName: "Alice",
			},
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			subtitle: "Alice - 1h",
			showTyping: false,
		});
	});

	it("renders no subtitle when there is no last message", () => {
		const result = resolveConversationButtonPreviewSelection({
			title: "Untitled conversation",
			lastMessage: null,
			isTyping: false,
			text,
		});

		expect(result).toEqual({
			subtitle: null,
			showTyping: false,
		});
	});

	it("keeps typing as the highest-priority preview state", () => {
		const result = resolveConversationButtonPreviewSelection({
			title: "Billing issue",
			lastMessage: {
				content: "Can you help me with my invoice?",
				time: "5m",
				isFromVisitor: true,
				senderName: "You",
			},
			isTyping: true,
			text,
		});

		expect(result).toEqual({
			subtitle: null,
			showTyping: true,
		});
	});
});
