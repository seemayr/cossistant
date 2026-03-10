import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("../actions/basic", () => ({
	ConversationBasicActions: () => null,
}));

mock.module("../actions/more", () => ({
	MoreConversationActions: () => null,
}));

const modulePromise = import("./index");

const baseNavigation = {
	onGoBack: () => {},
	onNavigateToPrevious: () => {},
	onNavigateToNext: () => {},
	hasPreviousConversation: false,
	hasNextConversation: false,
	selectedConversationIndex: 0,
	totalOpenConversations: 1,
};

async function renderHeader(title: string | null): Promise<string> {
	const { ConversationHeader } = await modulePromise;

	return renderToStaticMarkup(
		React.createElement(ConversationHeader, {
			isLeftSidebarOpen: true,
			isRightSidebarOpen: true,
			onToggleLeftSidebar: () => {},
			onToggleRightSidebar: () => {},
			navigation: baseNavigation,
			conversationId: "conv-1",
			visitorId: "visitor-1",
			title,
			titleSource: null,
			onUpdateTitle: async () => {},
		})
	);
}

describe("ConversationHeader", () => {
	it("renders the new conversation placeholder when no title is set", async () => {
		const html = await renderHeader(null);

		expect(html).toContain('placeholder="New conversation"');
		expect(html).toContain('value=""');
	});

	it("renders the current conversation title in the editable input", async () => {
		const html = await renderHeader("Billing issue");

		expect(html).toContain('value="Billing issue"');
	});
});
