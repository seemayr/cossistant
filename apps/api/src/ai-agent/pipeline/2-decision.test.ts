import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const runSmartDecisionMock = mock((async () => ({
	intent: "observe" as const,
	reasoning: "fallback",
	confidence: "high" as const,
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("./2a-smart-decision", () => ({
	runSmartDecision: runSmartDecisionMock,
}));

const modulePromise = import("@api/ai-agent/pipeline/2-decision");

function visitorMessage(
	content: string,
	overrides: Partial<{
		messageId: string;
		visibility: "public" | "private";
		senderType: "visitor" | "human_agent" | "ai_agent";
		senderName: string | null;
	}>
): {
	messageId: string;
	content: string;
	senderType: "visitor" | "human_agent" | "ai_agent";
	senderId: string;
	senderName: string | null;
	timestamp: string;
	visibility: "public" | "private";
} {
	return {
		messageId: overrides.messageId ?? "msg-trigger",
		content,
		senderType: overrides.senderType ?? "visitor",
		senderId: "sender-1",
		senderName: overrides.senderName ?? null,
		timestamp: new Date().toISOString(),
		visibility: overrides.visibility ?? "public",
	};
}

function buildInput(
	overrides: Partial<{
		conversationHistory: ReturnType<typeof visitorMessage>[];
		triggerMessage: ReturnType<typeof visitorMessage> | null;
	}>
) {
	const triggerMessage =
		overrides.triggerMessage ?? visitorMessage("Thanks", {});
	return {
		aiAgent: {
			id: "ai-1",
			name: "Coss",
		},
		conversation: {
			id: "conv-1",
			aiPausedUntil: null,
		},
		conversationHistory: overrides.conversationHistory ?? [triggerMessage],
		conversationState: {
			hasHumanAssignee: false,
			assigneeIds: [],
			participantIds: [],
			isEscalated: false,
			escalationReason: null,
		},
		triggerMessage,
	};
}

describe("decide", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		runSmartDecisionMock.mockReset();
		runSmartDecisionMock.mockResolvedValue({
			intent: "observe",
			reasoning: "fallback",
			confidence: "high",
		});
	});

	it("routes untagged visitor acknowledgements to smart decision", async () => {
		const { decide } = await modulePromise;
		const input = buildInput({
			triggerMessage: visitorMessage("thanks", {}),
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(false);
		expect(result.mode).toBe("background_only");
		expect(result.reason).toContain("Smart decision");
		expect(runSmartDecisionMock).toHaveBeenCalledTimes(1);
	});

	it("routes follow-up greetings through smart decision instead of hard-skipping", async () => {
		const { decide } = await modulePromise;
		runSmartDecisionMock.mockResolvedValueOnce({
			intent: "respond",
			reasoning: "Visitor greeted and still needs engagement",
			confidence: "high",
		});
		const priorTeam = visitorMessage("Happy to help", {
			messageId: "msg-team",
			senderType: "human_agent",
			senderName: "Sarah",
		});
		const trigger = visitorMessage("hi", { messageId: "msg-trigger-2" });
		const input = buildInput({
			conversationHistory: [priorTeam, trigger],
			triggerMessage: trigger,
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(true);
		expect(result.mode).toBe("respond_to_visitor");
		expect(result.reason).toContain("Smart decision");
		expect(runSmartDecisionMock).toHaveBeenCalledTimes(1);
	});

	it("still responds when explicitly tagged, even for short acknowledgements", async () => {
		const { decide } = await modulePromise;
		const trigger = visitorMessage("@coss thanks", { messageId: "msg-tagged" });
		const input = buildInput({
			conversationHistory: [trigger],
			triggerMessage: trigger,
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(true);
		expect(result.reason).toContain("explicitly tagged");
	});

	it("keeps private tagged teammate commands in command mode", async () => {
		const { decide } = await modulePromise;
		const trigger = visitorMessage(
			"@coss tell the visitor we've shipped the fix",
			{
				messageId: "msg-private-tag",
				senderType: "human_agent",
				senderName: "Sarah",
				visibility: "private",
			}
		);
		const input = buildInput({
			conversationHistory: [trigger],
			triggerMessage: trigger,
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(true);
		expect(result.mode).toBe("respond_to_command");
		expect(result.humanCommand).toContain("tell the visitor");
		expect(runSmartDecisionMock).toHaveBeenCalledTimes(0);
	});

	it("does not treat @ai alias as explicit tag anymore", async () => {
		const { decide } = await modulePromise;
		const trigger = visitorMessage("@ai thanks", { messageId: "msg-ai-alias" });
		const input = buildInput({
			conversationHistory: [trigger],
			triggerMessage: trigger,
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(false);
		expect(result.mode).toBe("background_only");
		expect(result.reason).toContain("Smart decision");
		expect(runSmartDecisionMock).toHaveBeenCalledTimes(1);
	});

	it("does not false-positive on mentions that include AI in another name", async () => {
		const { decide } = await modulePromise;
		const trigger = visitorMessage(
			"Hey @AI Studio Team yes, it's updated (it updates automatically when the doc changes!)",
			{ messageId: "msg-ai-studio-team" }
		);
		const input = buildInput({
			conversationHistory: [trigger],
			triggerMessage: trigger,
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(false);
		expect(result.mode).toBe("background_only");
		expect(result.reason).toContain("Smart decision");
		expect(runSmartDecisionMock).toHaveBeenCalledTimes(1);
	});

	it("routes untagged public teammate messages to smart decision", async () => {
		const { decide } = await modulePromise;
		runSmartDecisionMock.mockResolvedValueOnce({
			intent: "assist_team",
			reasoning: "Teammate requested internal support",
			confidence: "high",
		});

		const trigger = visitorMessage("Can you summarize this thread for me?", {
			messageId: "msg-human-public",
			senderType: "human_agent",
			senderName: "Sarah",
			visibility: "public",
		});
		const input = buildInput({
			conversationHistory: [trigger],
			triggerMessage: trigger,
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(true);
		expect(result.mode).toBe("background_only");
		expect(result.reason).toContain("Smart decision");
		expect(runSmartDecisionMock).toHaveBeenCalledTimes(1);
	});

	it("maps untagged public teammate observe decisions to background-only skip", async () => {
		const { decide } = await modulePromise;
		runSmartDecisionMock.mockResolvedValueOnce({
			intent: "observe",
			reasoning: "Human teammate is actively handling this",
			confidence: "high",
		});

		const trigger = visitorMessage("I am taking this ticket.", {
			messageId: "msg-human-public-observe",
			senderType: "human_agent",
			senderName: "Sarah",
			visibility: "public",
		});
		const input = buildInput({
			conversationHistory: [trigger],
			triggerMessage: trigger,
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(false);
		expect(result.mode).toBe("background_only");
		expect(result.reason).toContain("Smart decision");
		expect(runSmartDecisionMock).toHaveBeenCalledTimes(1);
	});

	it("maps untagged private teammate observe decisions to background-only skip", async () => {
		const { decide } = await modulePromise;
		runSmartDecisionMock.mockResolvedValueOnce({
			intent: "observe",
			reasoning: "Private teammate note does not require AI action",
			confidence: "high",
		});

		const trigger = visitorMessage("Internal note: I am handling this.", {
			messageId: "msg-human-private-observe",
			senderType: "human_agent",
			senderName: "Sarah",
			visibility: "private",
		});
		const input = buildInput({
			conversationHistory: [trigger],
			triggerMessage: trigger,
		});

		const result = await decide(input as never);

		expect(result.shouldAct).toBe(false);
		expect(result.mode).toBe("background_only");
		expect(result.reason).toContain("Smart decision");
		expect(runSmartDecisionMock).toHaveBeenCalledTimes(1);
	});
});
