import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	createTypingStore,
	setTypingState,
	type TypingStore,
} from "@cossistant/core";
import type { SupportControllerSnapshot } from "@cossistant/core/support-controller";
import { type Conversation, ConversationStatus } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SupportProvider } from "../provider";
import type { SupportTextResolvedFormatter } from "../support/text/locales/keys";
import { createMockSupportController } from "../test-utils/create-mock-support-controller";

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: string, variables?: Record<string, string>) => {
		switch (key) {
			case "common.fallbacks.unknown":
				return "Unknown";
			case "common.fallbacks.you":
				return "You";
			case "common.fallbacks.supportTeam":
				return "Support team";
			case "common.fallbacks.aiAssistant":
				return "AI Assistant";
			case "component.conversationButtonLink.fallbackTitle":
				return "Conversation";
			case "component.conversationButtonLink.typing":
				return `${variables?.name ?? "Someone"} is typing...`;
			default:
				throw new Error(`Unexpected text key: ${key}`);
		}
	}) as SupportTextResolvedFormatter;
}

const useSupportTextMock = mock(() => createTextFormatter());
const useConversationTimelineItemsMock = mock(() => ({
	items: currentTimelineItems,
}));

mock.module("../support/text", () => ({
	useSupportText: useSupportTextMock,
}));

mock.module("./use-conversation-timeline-items", () => ({
	useConversationTimelineItems: useConversationTimelineItemsMock,
}));

const useConversationPreviewModulePromise = import(
	"./use-conversation-preview"
);

const baseConversation: Conversation = {
	id: "conversation-1",
	createdAt: "2026-03-07T00:00:00.000Z",
	updatedAt: "2026-03-07T00:00:00.000Z",
	visitorId: "visitor-1",
	websiteId: "website-1",
	channel: "widget",
	status: ConversationStatus.OPEN,
	deletedAt: null,
	title: "Need help",
};

let currentTimelineItems: TimelineItem[];
let currentTypingStore: TypingStore;
let currentWebsite: SupportControllerSnapshot["website"];

function createMessageItem(
	overrides: Partial<TimelineItem> = {}
): TimelineItem {
	return {
		id: "item-1",
		conversationId: "conversation-1",
		organizationId: "org-1",
		type: "message",
		text: "Hello from support",
		parts: [{ type: "text", text: "Hello from support" }],
		visibility: "public",
		userId: "human-1",
		visitorId: null,
		aiAgentId: null,
		createdAt: "2026-03-07T01:00:00.000Z",
		deletedAt: null,
		...overrides,
	};
}

async function renderPreview(conversation: Conversation) {
	const { useConversationPreview } = await useConversationPreviewModulePromise;
	const controller = createMockSupportController({
		client: {
			typingStore: currentTypingStore,
		} as SupportControllerSnapshot["client"],
		website: currentWebsite,
	});
	let result: ReturnType<typeof useConversationPreview> | null = null;

	function Harness() {
		result = useConversationPreview({ conversation });
		return null;
	}

	renderToStaticMarkup(
		React.createElement(
			SupportProvider,
			{ autoConnect: false, controller },
			React.createElement(Harness)
		)
	);
	controller.destroy();
	return result;
}

describe("useConversationPreview", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		currentTypingStore = createTypingStore();
		currentWebsite = {
			description: null,
			domain: "acme.test",
			defaultLanguage: "en",
			id: "website-1",
			lastOnlineAt: null,
			logoUrl: null,
			name: "Acme",
			organizationId: "org-1",
			status: "online",
			availableAIAgents: [],
			availableHumanAgents: [],
			visitor: {
				id: "visitor-1",
				language: "en",
				contact: null,
				isBlocked: false,
			},
		};
		currentTimelineItems = [];

		useSupportTextMock.mockClear();
		useConversationTimelineItemsMock.mockClear();
	});

	it("uses the human email as Facehash name when the assigned human has a blank name", async () => {
		currentWebsite = {
			...currentWebsite,
			availableHumanAgents: [
				{
					id: "human-1",
					name: "   ",
					email: "human-1@example.com",
					image: null,
					lastSeenAt: null,
				},
			],
		};
		const conversation = {
			...baseConversation,
			lastTimelineItem: createMessageItem(),
		};

		const preview = await renderPreview(conversation);

		expect(preview?.lastMessage?.senderName).toBe("Support team");
		expect(preview?.assignedAgent).toEqual({
			type: "human",
			name: "Support team",
			facehashName: "human-1@example.com",
			facehashSeed: "human-1@example.com",
			image: null,
			lastSeenAt: null,
		});
	});

	it("uses the fallback label as Facehash name when the human roster entry is missing", async () => {
		const conversation = {
			...baseConversation,
			lastTimelineItem: createMessageItem({
				id: "item-404",
				userId: "human-404",
			}),
		};

		const preview = await renderPreview(conversation);

		expect(preview?.assignedAgent).toEqual({
			type: "human",
			name: "Support team",
			facehashName: "Support team",
			facehashSeed: "Support team",
			image: null,
			lastSeenAt: null,
		});
	});

	it("ignores AI typing for visitor-facing preview state", async () => {
		currentWebsite = {
			...currentWebsite,
			availableAIAgents: [
				{
					id: "ai-1",
					name: "Helper AI",
					image: null,
				},
			],
		};
		setTypingState(currentTypingStore, {
			conversationId: baseConversation.id,
			actorType: "ai_agent",
			actorId: "ai-1",
			isTyping: true,
		});

		const preview = await renderPreview(baseConversation);

		expect(preview?.typing).toEqual({
			participants: [],
			primaryParticipant: null,
			label: null,
			isTyping: false,
		});
	});
});
