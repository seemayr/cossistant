import { afterAll, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConversationStatus } from "@cossistant/types";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("../text", () => ({
	Text: ({
		textKey,
		...props
	}: React.ComponentProps<"span"> & { textKey: string }) => {
		const copy: Record<string, string> = {
			"component.conversationPage.closedMessage":
				"This conversation has been closed.",
			"component.conversationPage.commentPlaceholder":
				"Tell us more about your experience",
			"component.conversationPage.ratingLabel": "Rating",
			"component.conversationPage.ratingPrompt": "How did we do?",
			"component.conversationPage.ratingThanks": "Thanks for your feedback!",
			"component.conversationPage.spamMessage":
				"This conversation was marked as spam.",
			"component.conversationPage.submitFeedback": "Submit feedback",
		};

		return <span {...props}>{copy[textKey] ?? textKey}</span>;
	},
	useSupportText: () => (key: string, variables?: { rating?: number }) => {
		if (key === "component.conversationPage.ratingLabel") {
			return `Rating ${variables?.rating ?? ""}`.trim();
		}

		const copy: Record<string, string> = {
			"component.conversationPage.commentPlaceholder":
				"Tell us more about your experience",
			"component.conversationPage.ratingPrompt": "How did we do?",
			"component.conversationPage.ratingThanks": "Thanks for your feedback!",
			"component.conversationPage.submitFeedback": "Submit feedback",
		};

		return copy[key] ?? key;
	},
}));

const modulePromise = import("./conversation-resolved-feedback");

describe("ConversationResolvedFeedback", () => {
	afterAll(() => {
		mock.restore();
	});

	it("renders the shared rating primitive in the resolved thank-you state", async () => {
		const { ConversationResolvedFeedback } = await modulePromise;
		const html = renderToStaticMarkup(
			<ConversationResolvedFeedback
				rating={5}
				status={ConversationStatus.RESOLVED}
			/>
		);

		expect(html).toContain('data-feedback-rating-selector="true"');
		expect(html).toContain("Thanks for your feedback!");
	});

	it("uses the shared feedback primitives without the old composer hook", () => {
		const source = readFileSync(
			join(import.meta.dir, "conversation-resolved-feedback.tsx"),
			"utf8"
		);

		expect(source).toContain(
			'from "../../primitives/feedback-rating-selector"'
		);
		expect(source).toContain('from "../../primitives/feedback-comment-input"');
		expect(source).not.toContain("useFeedbackComposer");
	});
});
