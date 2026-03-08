import type { ToolSet } from "@api/lib/ai";
import type { CorePromptDocumentName } from "../../prompt/documents";
import type { ResolvedPromptBundle } from "../../prompt/resolver";
import { PROMPT_TEMPLATES } from "../../prompt/templates";
import type { GenerationRuntimeInput } from "../contracts";
import {
	buildModeInstructions,
	REPLY_FLOW_CONTRACT,
	TOOL_PROTOCOL,
} from "./templates";

const CORE_GENERATION_DOC_ORDER: CorePromptDocumentName[] = [
	"security.md",
	"agent.md",
	"behaviour.md",
	"visitor-contact.md",
	"participation.md",
	"grounding.md",
	"capabilities.md",
];

const CORE_GENERATION_DOC_TITLES: Record<CorePromptDocumentName, string> = {
	"agent.md": "Agent",
	"security.md": "Security",
	"behaviour.md": "Behaviour",
	"visitor-contact.md": "Visitor Contact",
	"participation.md": "Participation",
	"decision.md": "Decision",
	"grounding.md": "Grounding",
	"capabilities.md": "Capabilities",
};

function buildCorePromptStages(promptBundle: ResolvedPromptBundle): string[] {
	return CORE_GENERATION_DOC_ORDER.map((name) => {
		const content = promptBundle.coreDocuments[name]?.content?.trim() ?? "";
		if (!content) {
			return "";
		}

		return `## ${CORE_GENERATION_DOC_TITLES[name]}\n${content}`;
	}).filter((section) => section.trim().length > 0);
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

function interpolateTemplate(
	template: string,
	values: Record<string, string>
): string {
	return Object.entries(values).reduce(
		(rendered, [key, value]) => rendered.replaceAll(`{${key}}`, value),
		template
	);
}

function buildContinuationStage(input: GenerationRuntimeInput): string {
	const continuation = input.continuationContext;
	if (!continuation?.latestAiReply.trim()) {
		return "";
	}

	const deltaHint =
		input.triggerSenderType === "human_agent"
			? "Respond only to the new teammate request or instruction."
			: "Answer only the new inbound message and add only what is missing.";

	return interpolateTemplate(PROMPT_TEMPLATES.CONTINUATION_CONTEXT, {
		latestAiMessage: continuation.latestAiReply.trim(),
		continuationReason:
			"The previous processed inbound message already has an AI reply in the timeline.",
		continuationConfidence: "1.0",
		deltaHint,
	});
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

${TOOL_PROTOCOL}`;
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
	promptBundle: ResolvedPromptBundle;
	toolset: ToolSet;
	toolNames: string[];
	toolSkills?: Array<{ label: string; content: string }>;
}): string {
	const sections = [
		...buildCorePromptStages(params.promptBundle),
		buildContextFactsStage(params.input),
		buildContinuationStage(params.input),
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
		REPLY_FLOW_CONTRACT,
	].filter((section) => section.trim().length > 0);

	return sections.join("\n\n");
}
