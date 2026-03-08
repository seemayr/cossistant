import { afterEach, describe, expect, it } from "bun:test";
import type { RoleAwareMessage } from "../../../contracts";
import { extractDecisionSignals } from "./signals";

function createMessage(overrides: Partial<RoleAwareMessage>): RoleAwareMessage {
	return {
		messageId: "msg-1",
		content: "Hello",
		senderType: "visitor",
		senderId: null,
		senderName: null,
		timestamp: "2026-03-04T10:00:00.000Z",
		visibility: "public",
		...overrides,
	};
}

const originalDateNow = Date.now;

afterEach(() => {
	Date.now = originalDateNow;
});

describe("extractDecisionSignals", () => {
	it("uses the trigger timestamp instead of wall-clock time for human-active detection", () => {
		Date.now = () => Date.parse("2026-03-04T10:10:00.000Z");

		const humanMessage = createMessage({
			messageId: "msg-human",
			senderType: "human_agent",
			content: "I am checking this now.",
			timestamp: "2026-03-04T10:00:00.000Z",
		});
		const triggerMessage = createMessage({
			messageId: "msg-trigger",
			content: "Thanks",
			timestamp: "2026-03-04T10:01:50.000Z",
		});

		const signals = extractDecisionSignals({
			aiAgent: {} as never,
			conversation: {} as never,
			conversationHistory: [humanMessage, triggerMessage],
			conversationState: {
				hasHumanAssignee: false,
				assigneeIds: [],
				participantIds: [],
				isEscalated: false,
				escalationReason: null,
			},
			triggerMessage,
			decisionPolicy: "policy",
		});

		expect(signals.humanActive).toBe(true);
		expect(signals.lastHumanSecondsAgo).toBe(110);
	});
});
