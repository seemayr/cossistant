import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const createModelRawMock = mock((modelId: string) => modelId);
const generateTextMock = mock((async () => ({
	output: {
		intent: "observe",
		reasoning: "fallback",
		confidence: "high",
	},
})) as (...args: unknown[]) => Promise<unknown>);

mock.module("@api/lib/ai", () => ({
	createModelRaw: createModelRawMock,
	generateText: generateTextMock,
	Output: {
		object: ({ schema }: { schema: unknown }) => ({ schema }),
	},
}));

const SMART_DECISION_MODULE_PATH = "./2a-smart-decision.ts?real";
const modulePromise = import(SMART_DECISION_MODULE_PATH);

function message(
	content: string,
	overrides: Partial<{
		messageId: string;
		senderType: "visitor" | "human_agent" | "ai_agent";
		senderName: string | null;
		visibility: "public" | "private";
		timestamp: string;
	}>
) {
	return {
		messageId: overrides.messageId ?? "msg-1",
		content,
		senderType: overrides.senderType ?? "visitor",
		senderId: "sender-1",
		senderName: overrides.senderName ?? null,
		timestamp: overrides.timestamp ?? new Date().toISOString(),
		visibility: overrides.visibility ?? "public",
	};
}

function buildInput(
	overrides: Partial<{
		conversationHistory: ReturnType<typeof message>[];
		triggerMessage: ReturnType<typeof message>;
	}>
) {
	const triggerMessage = overrides.triggerMessage ?? message("hello", {});
	return {
		aiAgent: {
			id: "ai-1",
			name: "Coss",
		},
		conversation: {
			id: "conv-1",
		},
		conversationHistory: overrides.conversationHistory ?? [triggerMessage],
		conversationState: {
			hasHumanAssignee: true,
			assigneeIds: ["user-1"],
			participantIds: ["user-1"],
			isEscalated: false,
			escalationReason: null,
		},
		triggerMessage,
	};
}

describe("runSmartDecision", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		createModelRawMock.mockReset();
		generateTextMock.mockReset();
		generateTextMock.mockResolvedValue({
			output: {
				intent: "observe",
				reasoning: "fallback",
				confidence: "high",
			},
		});
	});

	it("routes untagged public teammate statement through model decision", async () => {
		const { runSmartDecision } = await modulePromise;
		const trigger = message("I will handle this thread.", {
			messageId: "msg-human-public",
			senderType: "human_agent",
			senderName: "Sarah",
			visibility: "public",
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("observe");
		expect(result.source).toBe("model");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("routes untagged private teammate note through model decision", async () => {
		const { runSmartDecision } = await modulePromise;
		const trigger = message("Internal note: I am on it.", {
			messageId: "msg-human-private",
			senderType: "human_agent",
			senderName: "Sarah",
			visibility: "private",
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("observe");
		expect(result.source).toBe("model");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("observes visitor ack while a human is active", async () => {
		const { runSmartDecision } = await modulePromise;
		const now = Date.now();
		const human = message("Happy to help.", {
			messageId: "msg-human-1",
			senderType: "human_agent",
			senderName: "Sarah",
			visibility: "public",
			timestamp: new Date(now - 30_000).toISOString(),
		});
		const trigger = message("thanks", {
			messageId: "msg-visitor-ack",
			senderType: "visitor",
			timestamp: new Date(now).toISOString(),
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [human, trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("observe");
		expect(result.source).toBe("rule");
		expect(result.ruleId).toBe("visitor_ack_with_human_active_observe");
		expect(generateTextMock).toHaveBeenCalledTimes(0);
	});

	it("uses model for explicit visitor question when no human is active", async () => {
		const { runSmartDecision } = await modulePromise;
		generateTextMock.mockResolvedValueOnce({
			output: {
				intent: "respond",
				reasoning: "Visitor asked a direct question",
				confidence: "high",
			},
		});
		const trigger = message(
			"trigger-once-check can you help me with checkout?",
			{
				messageId: "msg-visitor-q",
				senderType: "visitor",
			}
		);
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		const result = await runSmartDecision(input as never);
		const promptArg = generateTextMock.mock.calls[0]?.[0] as
			| { prompt?: string }
			| undefined;
		const prompt = promptArg?.prompt ?? "";
		const triggerMentions = prompt.match(/trigger-once-check/g) ?? [];

		expect(result.intent).toBe("respond");
		expect(result.source).toBe("model");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		expect(triggerMentions.length).toBe(1);
	});

	it("injects decision policy text into the model prompt when provided", async () => {
		const { runSmartDecision } = await modulePromise;
		const customPolicy =
			"## Decision Policy\n- Prefer observe unless there is a direct unresolved request.";
		const trigger = message("Can you help me with billing?", {
			messageId: "msg-custom-policy",
			senderType: "visitor",
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		await runSmartDecision({
			...input,
			decisionPolicy: customPolicy,
		} as never);

		const promptArg = generateTextMock.mock.calls[0]?.[0] as
			| { prompt?: string }
			| undefined;
		expect(promptArg?.prompt).toContain(customPolicy);
	});

	it("retries with fallback model on primary timeout", async () => {
		const { runSmartDecision } = await modulePromise;
		const timeoutError = new Error("aborted");
		timeoutError.name = "AbortError";
		generateTextMock.mockRejectedValueOnce(timeoutError);
		generateTextMock.mockResolvedValueOnce({
			output: {
				intent: "respond",
				reasoning: "Visitor asked a billing question",
				confidence: "high",
			},
		});

		const trigger = message("How does billing work?", {
			messageId: "msg-visitor-retry",
			senderType: "visitor",
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("respond");
		expect(result.source).toBe("model");
		expect(generateTextMock).toHaveBeenCalledTimes(2);
	});

	it("retries with fallback model on primary error", async () => {
		const { runSmartDecision } = await modulePromise;
		generateTextMock.mockRejectedValueOnce(new Error("model unavailable"));
		generateTextMock.mockResolvedValueOnce({
			output: {
				intent: "respond",
				reasoning: "Visitor needs help",
				confidence: "high",
			},
		});

		const trigger = message("How does billing work?", {
			messageId: "msg-visitor-error-retry",
			senderType: "visitor",
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("respond");
		expect(result.source).toBe("model");
		expect(generateTextMock).toHaveBeenCalledTimes(2);
	});

	it("retries with fallback model on primary empty output", async () => {
		const { runSmartDecision } = await modulePromise;
		generateTextMock.mockResolvedValueOnce({ output: null });
		generateTextMock.mockResolvedValueOnce({
			output: {
				intent: "respond",
				reasoning: "Visitor needs help",
				confidence: "high",
			},
		});

		const trigger = message("How does billing work?", {
			messageId: "msg-visitor-empty-retry",
			senderType: "visitor",
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("respond");
		expect(result.source).toBe("model");
		expect(generateTextMock).toHaveBeenCalledTimes(2);
	});

	it("falls back to observe only when all models fail", async () => {
		const { runSmartDecision } = await modulePromise;
		const timeoutError = new Error("aborted");
		timeoutError.name = "AbortError";
		generateTextMock.mockRejectedValueOnce(timeoutError);
		generateTextMock.mockRejectedValueOnce(timeoutError);

		const trigger = message("How does billing work?", {
			messageId: "msg-visitor-all-fail",
			senderType: "visitor",
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("observe");
		expect(result.source).toBe("fallback");
		expect(result.ruleId).toBe("timeout_observe");
		expect(generateTextMock).toHaveBeenCalledTimes(2);
	});

	it("falls back to observe when all models return empty output", async () => {
		const { runSmartDecision } = await modulePromise;
		generateTextMock.mockResolvedValueOnce({ output: null });
		generateTextMock.mockResolvedValueOnce({ output: null });

		const trigger = message("How does billing work?", {
			messageId: "msg-visitor-all-empty",
			senderType: "visitor",
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("observe");
		expect(result.source).toBe("fallback");
		expect(result.ruleId).toBe("empty_output_observe");
	});

	it("clamps low-confidence respond to observe when human is active and trigger is not a question", async () => {
		const { runSmartDecision } = await modulePromise;
		const now = Date.now();
		generateTextMock.mockResolvedValueOnce({
			output: {
				intent: "respond",
				reasoning: "AI should proactively answer",
				confidence: "medium",
			},
		});
		const human = message("I can take this.", {
			messageId: "msg-human-recent",
			senderType: "human_agent",
			senderName: "Sarah",
			visibility: "public",
			timestamp: new Date(now - 20_000).toISOString(),
		});
		const trigger = message("I saw the update. Waiting now.", {
			messageId: "msg-visitor-non-question",
			senderType: "visitor",
			timestamp: new Date(now).toISOString(),
		});
		const input = buildInput({
			triggerMessage: trigger,
			conversationHistory: [human, trigger],
		});

		const result = await runSmartDecision(input as never);

		expect(result.intent).toBe("observe");
		expect(result.source).toBe("rule");
		expect(result.ruleId).toBe(
			"post_model_human_active_low_confidence_observe"
		);
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});
});
