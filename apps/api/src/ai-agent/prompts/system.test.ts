import { describe, expect, it } from "bun:test";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { RoleAwareMessage } from "../context/conversation";
import type { VisitorContext } from "../context/visitor";
import { getDefaultBehaviorSettings } from "../settings/defaults";
import {
	type AvailableCustomSkill,
	buildSystemPrompt,
	type PromptSkillDocument,
} from "./system";

function createAgent(): AiAgentSelect {
	return {
		id: "01JTESTAGENT0000000000000",
		name: "Agent",
		description: null,
		basePrompt: "You are helpful.",
		model: "openai/gpt-5-mini",
		temperature: 0.7,
		maxOutputTokens: 1024,
		organizationId: "01JTESTORG00000000000000",
		websiteId: "01JTESTWEB00000000000000",
		isActive: true,
		lastUsedAt: null,
		lastTrainedAt: null,
		trainingStatus: "idle",
		trainingProgress: 0,
		trainingError: null,
		trainingStartedAt: null,
		trainedItemsCount: null,
		usageCount: 0,
		goals: null,
		metadata: null,
		behaviorSettings:
			getDefaultBehaviorSettings() as AiAgentSelect["behaviorSettings"],
		onboardingCompletedAt: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null,
	};
}

function createConversation(): ConversationSelect {
	return {
		id: "conv-test",
		createdAt: new Date().toISOString(),
	} as ConversationSelect;
}

function buildPromptWithSkills(options?: {
	selectedSkills?: PromptSkillDocument[];
	availableCustomSkills?: AvailableCustomSkill[];
}): string {
	return buildSystemPrompt({
		aiAgent: createAgent(),
		conversation: createConversation(),
		conversationHistory: [] as RoleAwareMessage[],
		visitorContext: null,
		mode: "respond_to_visitor",
		humanCommand: null,
		availableCustomSkills: options?.availableCustomSkills,
		selectedSkillDocuments: options?.selectedSkills,
	});
}

function buildPromptWithVisitor(options: {
	visitorContext: VisitorContext | null;
	promptBundle?: Parameters<typeof buildSystemPrompt>[0]["promptBundle"];
	mode?: Parameters<typeof buildSystemPrompt>[0]["mode"];
}): string {
	return buildSystemPrompt({
		aiAgent: createAgent(),
		conversation: createConversation(),
		conversationHistory: [] as RoleAwareMessage[],
		visitorContext: options.visitorContext,
		mode: options.mode ?? "respond_to_visitor",
		humanCommand: null,
		promptBundle: options.promptBundle,
	});
}

describe("buildSystemPrompt skill sections", () => {
	it("renders tool skills, available custom metadata, and loaded custom skills separately", () => {
		const prompt = buildPromptWithSkills({
			selectedSkills: [
				{
					name: "send-message",
					content: "Use sendMessage first.",
					source: "tool",
					toolId: "sendMessage",
					toolLabel: "Send Public Message",
				},
				{
					name: "refund-playbook",
					content: "Handle refund requests with policy references.",
					source: "custom",
				},
			],
			availableCustomSkills: [
				{
					name: "refunds.md",
					description: "Use for refund policy and workflow requests.",
				},
			],
		});

		const toolSectionIndex = prompt.indexOf("## Tool Skills (Required)");
		const availableSectionIndex = prompt.indexOf("## Available Custom Skills");
		const customSectionIndex = prompt.indexOf(
			"## Loaded Custom Skills (Contextual)"
		);

		expect(toolSectionIndex).toBeGreaterThan(-1);
		expect(availableSectionIndex).toBeGreaterThan(-1);
		expect(customSectionIndex).toBeGreaterThan(-1);
		expect(availableSectionIndex).toBeGreaterThan(toolSectionIndex);
		expect(customSectionIndex).toBeGreaterThan(availableSectionIndex);
		expect(prompt).toContain("### Send Public Message");
		expect(prompt).toContain("Use sendMessage first.");
		expect(prompt).toContain(
			"**refunds.md**: Use for refund policy and workflow requests."
		);
		expect(prompt).toContain("### refund-playbook");
	});

	it("renders available custom metadata without full custom content before load", () => {
		const prompt = buildPromptWithSkills({
			selectedSkills: [
				{
					name: "send-message",
					content: "Use sendMessage first.",
					source: "tool",
					toolId: "sendMessage",
					toolLabel: "Send Public Message",
				},
			],
			availableCustomSkills: [
				{
					name: "refunds.md",
					description: "Use for refund policy and workflow requests.",
				},
			],
		});

		expect(prompt).toContain("## Available Custom Skills");
		expect(prompt).toContain(
			"**refunds.md**: Use for refund policy and workflow requests."
		);
		expect(prompt).not.toContain("## Loaded Custom Skills (Contextual)");
		expect(prompt).not.toContain(
			"Handle refund requests with policy references."
		);
	});

	it("omits skill sections when no skills are available or loaded", () => {
		const prompt = buildPromptWithSkills({});

		expect(prompt).not.toContain("## Tool Skills (Required)");
		expect(prompt).not.toContain("## Available Custom Skills");
		expect(prompt).not.toContain("## Loaded Custom Skills (Contextual)");
	});
});

describe("buildSystemPrompt visitor contact behavior", () => {
	it("includes visitor contact instructions for unidentified visitors", () => {
		const prompt = buildPromptWithVisitor({
			visitorContext: { isIdentified: false } as VisitorContext,
		});

		expect(prompt).toContain("## Visitor Identification");
		expect(prompt).toContain("only if needed");
	});

	it("uses visitor-contact core override when provided", () => {
		const prompt = buildPromptWithVisitor({
			visitorContext: { isIdentified: false } as VisitorContext,
			promptBundle: {
				coreDocuments: {
					"security.md": {
						name: "security.md",
						content: "",
						source: "fallback",
						priority: 0,
					},
					"agent.md": {
						name: "agent.md",
						content: "",
						source: "fallback",
						priority: 0,
					},
					"behaviour.md": {
						name: "behaviour.md",
						content: "",
						source: "fallback",
						priority: 0,
					},
					"visitor-contact.md": {
						name: "visitor-contact.md",
						content:
							"## Visitor Identification\\n\\nCustom visitor contact policy.",
						source: "override",
						priority: 1,
					},
					"participation.md": {
						name: "participation.md",
						content: "",
						source: "fallback",
						priority: 0,
					},
					"decision.md": {
						name: "decision.md",
						content: "",
						source: "fallback",
						priority: 0,
					},
					"grounding.md": {
						name: "grounding.md",
						content: "",
						source: "fallback",
						priority: 0,
					},
					"capabilities.md": {
						name: "capabilities.md",
						content: "",
						source: "fallback",
						priority: 0,
					},
				},
				enabledSkills: [],
			},
		});

		expect(prompt).toContain("Custom visitor contact policy.");
	});

	it("does not include visitor contact behavior when visitor is already identified", () => {
		const prompt = buildPromptWithVisitor({
			visitorContext: { isIdentified: true } as VisitorContext,
		});

		expect(prompt).not.toContain("## Visitor Identification");
	});
});
