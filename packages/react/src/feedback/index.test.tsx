import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type CossistantContextValue, SupportContext } from "../provider";
import { Feedback } from "./index";

function createSupportContextValue(): CossistantContextValue {
	return {
		website: {
			id: "site_123",
			name: "Acme",
			availableAIAgents: [],
			availableHumanAgents: [],
			visitor: {
				id: "visitor_123",
				language: "en",
				contact: null,
				isBlocked: false,
			},
		} as CossistantContextValue["website"],
		defaultMessages: [],
		quickOptions: [],
		setDefaultMessages: () => {},
		setQuickOptions: () => {},
		unreadCount: 0,
		setUnreadCount: () => {},
		isLoading: false,
		error: null,
		configurationError: null,
		client: {
			submitFeedback: async () => ({
				feedback: {
					id: "feedback_123",
				},
			}),
		} as CossistantContextValue["client"],
		isOpen: false,
		open: () => {},
		close: () => {},
		toggle: () => {},
	};
}

function renderWithSupportContext(node: React.ReactNode): string {
	return renderToStaticMarkup(
		<SupportContext.Provider value={createSupportContextValue()}>
			{node}
		</SupportContext.Provider>
	);
}

describe("Feedback widget", () => {
	it("renders the default panel with shared feedback primitives", () => {
		const html = renderWithSupportContext(
			<Feedback
				defaultOpen
				topics={["Bug", "Feature request", "Pricing"]}
				trigger="billing"
			/>
		);

		expect(html).toContain("Share feedback");
		expect(html).toContain('data-feedback-rating-selector="true"');
		expect(html).toContain('data-feedback-topic-select="true"');
		expect(html).toContain("Select a topic...");
	});

	it("keeps custom content hidden when the root is closed", () => {
		const html = renderWithSupportContext(
			<Feedback.Root open={false}>
				<Feedback.Trigger>Open feedback</Feedback.Trigger>
				<Feedback.Content>
					<div>Custom feedback body</div>
				</Feedback.Content>
			</Feedback.Root>
		);

		expect(html).toContain("Open feedback");
		expect(html).not.toContain("Custom feedback body");
	});

	it("renders custom trigger and content when the root is open", () => {
		const html = renderWithSupportContext(
			<Feedback.Root open theme="dark">
				<Feedback.Trigger>Open feedback</Feedback.Trigger>
				<Feedback.Content>
					<div>Custom feedback body</div>
				</Feedback.Content>
			</Feedback.Root>
		);

		expect(html).toContain("Open feedback");
		expect(html).toContain("Custom feedback body");
		expect(html).toContain('data-color-scheme="dark"');
	});

	it("forwards topic, trigger, conversation, and visitor context in the widget payload", () => {
		const source = readFileSync(
			join(import.meta.dir, "components", "panel.tsx"),
			"utf8"
		);

		expect(source).toContain("client.submitFeedback({");
		expect(source).toContain("topic: normalizedTopic || undefined");
		expect(source).toContain("trigger: trigger?.trim() || undefined");
		expect(source).toContain("conversationId");
		expect(source).toContain("visitorId: website.visitor.id");
		expect(source).toContain("contactId: website.visitor.contact?.id");
		expect(source).not.toContain("useFeedbackComposer");
	});
});
