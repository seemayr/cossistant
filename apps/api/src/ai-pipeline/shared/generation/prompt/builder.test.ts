import { describe, expect, it } from "bun:test";
import { buildGenerationSystemPrompt } from "./builder";
import { STAGE_5_FINAL_MESSAGE_CONTRACT } from "./templates";

function createInput(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		db: {} as never,
		pipelineKind: "primary" as const,
		mode: "respond_to_command" as const,
		aiAgent: {
			id: "ai-1",
			name: "Agent",
			model: "moonshotai/kimi-k2.5",
			basePrompt: "Help the visitor clearly.",
		} as never,
		conversation: {
			id: "conv-1",
		} as never,
		conversationHistory: [],
		visitorContext: null,
		conversationState: {
			isEscalated: false,
			escalationReason: null,
			hasHumanAssignee: false,
		},
		humanCommand: "Reply to the visitor with next steps.",
		workflowRunId: "wf-1",
		triggerMessageId: "msg-1",
		allowPublicMessages: true,
		...overrides,
	};
}

describe("buildGenerationSystemPrompt", () => {
	it("appends final public message contract as the terminal section", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput() as never,
			toolset: {
				sendMessage: { description: "Send the main response" },
				respond: { description: "Finish respond" },
			} as never,
			toolNames: ["sendMessage", "respond"],
			toolSkills: [
				{
					label: "Send Main Message",
					content: "Use this tool for the primary answer.",
				},
			],
		});

		expect(
			prompt.trimEnd().endsWith(STAGE_5_FINAL_MESSAGE_CONTRACT.trim())
		).toBe(true);
	});

	it("includes mandatory main-message and once-per-run requirements", () => {
		const prompt = buildGenerationSystemPrompt({
			input: createInput() as never,
			toolset: {
				sendAcknowledgeMessage: { description: "Ack" },
				sendMessage: { description: "Main" },
				sendFollowUpMessage: { description: "Follow up" },
				respond: { description: "Finish respond" },
			} as never,
			toolNames: [
				"sendAcknowledgeMessage",
				"sendMessage",
				"sendFollowUpMessage",
				"respond",
			],
		});

		expect(prompt).toContain(
			"Each of those three tools can be used at most once per run."
		);
		expect(prompt).toContain(
			"sendMessage is mandatory when mode is not background_only and finish action is not skip."
		);
		expect(prompt).toContain(
			"Allowed sequences only: main, ack->main, main->followUp, ack->main->followUp."
		);
	});
});
