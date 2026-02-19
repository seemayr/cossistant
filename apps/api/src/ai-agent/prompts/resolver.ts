import {
	CORE_PROMPT_DOCUMENT_NAMES,
	type CorePromptDocumentName,
} from "@api/ai-agent/prompts/documents";
import {
	buildCapabilitiesInstructions,
	buildEscalationInstructions,
	buildModeBehaviorInstructions,
} from "@api/ai-agent/prompts/instructions";
import type { Database } from "@api/db";
import { listAiAgentPromptDocuments } from "@api/db/queries/ai-agent-prompt-document";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { AiAgentPromptDocumentSelect } from "@api/db/schema/ai-agent-prompt-document";
import type { ResponseMode } from "../pipeline/2-decision";
import { getBehaviorSettings } from "../settings";
import { CORE_SECURITY_PROMPT } from "./security";
import { PROMPT_TEMPLATES } from "./templates";

export type ResolvedCorePromptDocument = {
	name: CorePromptDocumentName;
	content: string;
	source: "db" | "fallback";
	priority: number;
};

export type ResolvedSkillPromptDocument = {
	id: string;
	name: string;
	content: string;
	priority: number;
};

export type ResolvedPromptBundle = {
	coreDocuments: Record<CorePromptDocumentName, ResolvedCorePromptDocument>;
	enabledSkills: ResolvedSkillPromptDocument[];
};

type ResolvePromptBundleInput = {
	db: Database;
	aiAgent: AiAgentSelect;
	mode: ResponseMode;
};

function buildFallbackCoreDocuments(
	aiAgent: AiAgentSelect,
	mode: ResponseMode
): Record<CorePromptDocumentName, string> {
	const settings = getBehaviorSettings(aiAgent);

	const behaviorSections = [
		buildEscalationInstructions(settings),
		buildModeBehaviorInstructions(mode),
	].filter(Boolean);

	const capabilities = buildCapabilitiesInstructions(settings);

	return {
		"agent.md": aiAgent.basePrompt,
		"security.md": CORE_SECURITY_PROMPT,
		"behaviour.md": behaviorSections.join("\n\n"),
		"participation.md": PROMPT_TEMPLATES.PARTICIPATION_POLICY,
		"decision.md": PROMPT_TEMPLATES.DECISION_POLICY,
		"grounding.md":
			mode === "respond_to_visitor"
				? PROMPT_TEMPLATES.GROUNDING_INSTRUCTIONS
				: "",
		"capabilities.md": capabilities || PROMPT_TEMPLATES.CAPABILITIES,
	};
}

function chooseCoreDocument(
	documents: AiAgentPromptDocumentSelect[],
	name: CorePromptDocumentName,
	fallback: string
): ResolvedCorePromptDocument {
	const fromDb = documents.find(
		(document) => document.kind === "core" && document.name === name
	);
	if (fromDb) {
		return {
			name,
			content: fromDb.content,
			source: "db",
			priority: fromDb.priority,
		};
	}

	return {
		name,
		content: fallback,
		source: "fallback",
		priority: 0,
	};
}

export async function resolvePromptBundle(
	input: ResolvePromptBundleInput
): Promise<ResolvedPromptBundle> {
	const { db, aiAgent, mode } = input;
	const fallbackDocuments = buildFallbackCoreDocuments(aiAgent, mode);

	const documents = await listAiAgentPromptDocuments(
		db,
		{
			organizationId: aiAgent.organizationId,
			websiteId: aiAgent.websiteId,
			aiAgentId: aiAgent.id,
		},
		{ enabled: true }
	);

	const coreDocuments = CORE_PROMPT_DOCUMENT_NAMES.reduce(
		(accumulator, name) => {
			accumulator[name] = chooseCoreDocument(
				documents,
				name,
				fallbackDocuments[name]
			);
			return accumulator;
		},
		{} as Record<CorePromptDocumentName, ResolvedCorePromptDocument>
	);

	// capabilities.md must always resolve to content, even if all docs are empty
	if (!coreDocuments["capabilities.md"].content.trim()) {
		coreDocuments["capabilities.md"] = {
			name: "capabilities.md",
			content: fallbackDocuments["capabilities.md"],
			source: "fallback",
			priority: 0,
		};
	}

	// decision.md must always resolve to content so the decision stage stays prompt-driven
	if (!coreDocuments["decision.md"].content.trim()) {
		coreDocuments["decision.md"] = {
			name: "decision.md",
			content: fallbackDocuments["decision.md"],
			source: "fallback",
			priority: 0,
		};
	}

	const enabledSkills: ResolvedSkillPromptDocument[] = documents
		.filter((document) => document.kind === "skill")
		.sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority;
			}
			return a.name.localeCompare(b.name);
		})
		.map((document) => ({
			id: document.id,
			name: document.name,
			content: document.content,
			priority: document.priority,
		}));

	return {
		coreDocuments,
		enabledSkills,
	};
}
