import { describe, expect, it } from "bun:test";
import { runDeterministicDecision } from "./deterministic";
import { mapSmartDecisionToDecisionResult } from "./result-mapping";
import type { DecisionStepInput } from "./types";

function createInput(
	overrides: Partial<DecisionStepInput> = {}
): DecisionStepInput {
	return {
		aiAgent: {
			id: "ai-1",
			name: "Agent One",
		} as never,
		conversation: {
			id: "conv-1",
			aiPausedUntil: null,
		} as never,
		conversationHistory: [],
		conversationState: {
			hasHumanAssignee: false,
			assigneeIds: [],
			participantIds: [],
			isEscalated: false,
			escalationReason: null,
		},
		triggerMessage: {
			messageId: "msg-1",
			content: "Can you help with this issue?",
			senderType: "visitor",
			senderId: "visitor-1",
			senderName: "Visitor",
			timestamp: "2026-03-05T00:00:00.000Z",
			visibility: "public",
		},
		...overrides,
	};
}

describe("runDeterministicDecision", () => {
	it("returns skip when trigger message is missing", () => {
		const result = runDeterministicDecision(
			createInput({
				triggerMessage: null,
			})
		);

		expect(result).toEqual({
			type: "final",
			result: {
				shouldAct: false,
				reason: "No trigger message",
				mode: "background_only",
				humanCommand: null,
				isEscalated: false,
				escalationReason: null,
			},
		});
	});

	it("returns skip for ai-authored trigger message", () => {
		const result = runDeterministicDecision(
			createInput({
				triggerMessage: {
					messageId: "msg-2",
					content: "I already replied",
					senderType: "ai_agent",
					senderId: "ai-1",
					senderName: "Agent One",
					timestamp: "2026-03-05T00:00:00.000Z",
					visibility: "public",
				},
			})
		);

		expect(result).toEqual({
			type: "final",
			result: {
				shouldAct: false,
				reason: "AI-authored message cannot trigger AI response",
				mode: "background_only",
				humanCommand: null,
				isEscalated: false,
				escalationReason: null,
			},
		});
	});

	it("returns tagged command mode for human mention", () => {
		const result = runDeterministicDecision(
			createInput({
				triggerMessage: {
					messageId: "msg-3",
					content: "@Agent One draft a concise visitor update",
					senderType: "human_agent",
					senderId: "user-1",
					senderName: "Support Agent",
					timestamp: "2026-03-05T00:00:00.000Z",
					visibility: "private",
				},
			})
		);

		expect(result).toEqual({
			type: "final",
			result: {
				shouldAct: true,
				reason: "AI was explicitly tagged",
				mode: "respond_to_command",
				humanCommand: "draft a concise visitor update",
				isEscalated: false,
				escalationReason: null,
			},
		});
	});
});

describe("mapSmartDecisionToDecisionResult", () => {
	it("maps assist_team to background mode with human command for teammate triggers", () => {
		const result = mapSmartDecisionToDecisionResult({
			input: createInput({
				triggerMessage: {
					messageId: "msg-4",
					content: "Please summarize",
					senderType: "human_agent",
					senderId: "user-1",
					senderName: "Support Agent",
					timestamp: "2026-03-05T00:00:00.000Z",
					visibility: "private",
				},
			}),
			cleanedTriggerText: "please summarize",
			smartDecision: {
				intent: "assist_team",
				reasoning: "Provide private help",
				confidence: "medium",
				source: "model",
			},
		});

		expect(result).toMatchObject({
			shouldAct: true,
			mode: "background_only",
			humanCommand: "please summarize",
			reason: "Smart decision: Provide private help",
		});
	});

	it("maps observe to non-acting background mode", () => {
		const result = mapSmartDecisionToDecisionResult({
			input: createInput(),
			cleanedTriggerText: "ignored",
			smartDecision: {
				intent: "observe",
				reasoning: "Human team is active",
				confidence: "high",
				source: "rule",
				ruleId: "visitor_ack_with_human_active_observe",
			},
		});

		expect(result).toMatchObject({
			shouldAct: false,
			mode: "background_only",
			humanCommand: null,
			reason: "Smart decision: Human team is active",
		});
	});

	it("maps respond to respond_to_command when trigger is human", () => {
		const result = mapSmartDecisionToDecisionResult({
			input: createInput({
				triggerMessage: {
					messageId: "msg-5",
					content: "Need a reply",
					senderType: "human_agent",
					senderId: "user-1",
					senderName: "Support Agent",
					timestamp: "2026-03-05T00:00:00.000Z",
					visibility: "private",
				},
			}),
			cleanedTriggerText: "need a reply",
			smartDecision: {
				intent: "respond",
				reasoning: "Proceed",
				confidence: "high",
				source: "model",
			},
		});

		expect(result).toMatchObject({
			shouldAct: true,
			mode: "respond_to_command",
			humanCommand: "need a reply",
			reason: "Smart decision: Proceed",
		});
	});
});
