import { describe, expect, it } from "bun:test";
import {
	createTypingPreview,
	FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT,
	FAKE_CONVERSATION_HUMAN_REPLY_TEXT,
	FAKE_CONVERSATION_HUMAN_TYPING_START_AT,
	FAKE_CONVERSATION_VISITOR_TYPING_START_AT,
	getFakeConversationHumanReplyState,
} from "./use-fake-conversation";

describe("fake dashboard conversation playback helpers", () => {
	it("starts the scripted human reply typing before the message is committed", () => {
		expect(FAKE_CONVERSATION_HUMAN_TYPING_START_AT).toBeLessThan(
			FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT
		);

		expect(
			getFakeConversationHumanReplyState(
				FAKE_CONVERSATION_HUMAN_TYPING_START_AT - 1
			)
		).toEqual({
			composerValue: "",
			hasCommittedMessage: false,
			isComposerTyping: false,
			showsPlaceholder: true,
		});

		expect(
			getFakeConversationHumanReplyState(
				FAKE_CONVERSATION_HUMAN_TYPING_START_AT + 1
			)
		).toEqual({
			composerValue: FAKE_CONVERSATION_HUMAN_REPLY_TEXT,
			hasCommittedMessage: false,
			isComposerTyping: true,
			showsPlaceholder: false,
		});

		expect(
			getFakeConversationHumanReplyState(
				FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT
			)
		).toEqual({
			composerValue: "",
			hasCommittedMessage: true,
			isComposerTyping: false,
			showsPlaceholder: true,
		});
	});

	it("keeps the visitor typing preview behavior unchanged", () => {
		expect(FAKE_CONVERSATION_VISITOR_TYPING_START_AT).toBeGreaterThan(
			FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT
		);
		expect(createTypingPreview("Typing preview", 0)).toBe("");
		expect(createTypingPreview("Typing preview", 50)).toBe("Typing ");
		expect(createTypingPreview("Typing preview", 100)).toBe("Typing preview");
	});
});
