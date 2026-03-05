import type { ToolSet } from "@api/lib/ai";
import type { GenerationRuntimeInput } from "../contracts";
import {
	buildModeInstructions,
	STAGE_1_RUNTIME_GUARDRAILS,
	STAGE_4_TOOL_PROTOCOL,
	STAGE_5_FINAL_MESSAGE_CONTRACT,
} from "./templates";

function buildAgentBehaviorStage(input: GenerationRuntimeInput): string {
	return `## Agent Behavior
You are ${input.aiAgent.name}, an AI support assistant.

${input.aiAgent.basePrompt.trim()}`;
}

function buildVisitorSummary(input: GenerationRuntimeInput): string {
	const visitor = input.visitorContext;
	if (!visitor) {
		return "Visitor context: unavailable";
	}

	return [
		`name=${visitor.name ?? "unknown"}`,
		`email=${visitor.email ?? "unknown"}`,
		`identified=${visitor.isIdentified ? "yes" : "no"}`,
		`location=${[visitor.city, visitor.country].filter(Boolean).join(", ") || "unknown"}`,
		`language=${visitor.language ?? "unknown"}`,
	].join(" | ");
}

function buildContextFactsStage(input: GenerationRuntimeInput): string {
	return `## Context Facts
conversationId=${input.conversation.id}
triggerMessageId=${input.triggerMessageId}
triggerSenderType=${input.triggerSenderType ?? "unknown"}
triggerVisibility=${input.triggerVisibility ?? "unknown"}
conversationEscalated=${input.conversationState.isEscalated ? "yes" : "no"}
escalationReason=${input.conversationState.escalationReason ?? "none"}
hasHumanAssignee=${input.conversationState.hasHumanAssignee ? "yes" : "no"}
mode=${input.mode}
visitor=${buildVisitorSummary(input)}
humanCommand=${input.humanCommand?.trim() || "none"}`;
}

function buildToolInventorySection(params: {
	toolset: ToolSet;
	toolNames: string[];
}): string {
	if (params.toolNames.length === 0) {
		return "No tools available.";
	}

	return params.toolNames
		.map((toolName) => {
			const tool = params.toolset[toolName];
			const description =
				tool && typeof tool === "object" && "description" in tool
					? typeof tool.description === "string"
						? tool.description
						: "No description"
					: "No description";
			return `- ${toolName}: ${description}`;
		})
		.join("\n");
}

function buildToolStage(params: {
	toolset: ToolSet;
	toolNames: string[];
}): string {
	return `## Tool Inventory
${buildToolInventorySection(params)}

${STAGE_4_TOOL_PROTOCOL}`;
}

function buildToolSkillStage(params: {
	toolSkills: Array<{ label: string; content: string }>;
}): string {
	if (params.toolSkills.length === 0) {
		return "";
	}

	const entries = params.toolSkills
		.map(
			(skill) =>
				`### ${skill.label}\n${skill.content.trim() || "No additional instructions."}`
		)
		.join("\n\n");

	return `## Active Tool Skills\nApply these tool-specific instructions when relevant.\n\n${entries}`;
}

export function buildGenerationSystemPrompt(params: {
	input: GenerationRuntimeInput;
	toolset: ToolSet;
	toolNames: string[];
	toolSkills?: Array<{ label: string; content: string }>;
}): string {
	const sections = [
		STAGE_1_RUNTIME_GUARDRAILS,
		buildAgentBehaviorStage(params.input),
		buildContextFactsStage(params.input),
		buildToolStage({
			toolset: params.toolset,
			toolNames: params.toolNames,
		}),
		buildToolSkillStage({
			toolSkills: params.toolSkills ?? [],
		}),
		buildModeInstructions({
			mode: params.input.mode,
			humanCommand: params.input.humanCommand,
		}),
		STAGE_5_FINAL_MESSAGE_CONTRACT,
	].filter((section) => section.trim().length > 0);

	return sections.join("\n\n");
}
