import type { ResolvedPromptBundle } from "@api/ai-agent/prompts/resolver";
import { getBehaviorSettings } from "@api/ai-agent/settings";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { AiAgentPromptDocumentSelect } from "@api/db/schema/ai-agent-prompt-document";
import {
	AI_AGENT_DEFAULT_SKILL_TEMPLATES,
	AI_AGENT_SYSTEM_SKILL_METADATA,
	AI_AGENT_TOOL_CATALOG,
	type AiAgentBehaviorSettingKey,
	type GetCapabilitiesStudioResponse,
} from "@cossistant/types";

function getBehaviorSettingValue(
	settings: ReturnType<typeof getBehaviorSettings>,
	key: AiAgentBehaviorSettingKey
): boolean {
	switch (key) {
		case "canResolve":
			return settings.canResolve;
		case "canMarkSpam":
			return settings.canMarkSpam;
		case "canSetPriority":
			return settings.canSetPriority;
		case "canEscalate":
			return settings.canEscalate;
		case "autoGenerateTitle":
			return settings.autoGenerateTitle;
		case "autoAnalyzeSentiment":
			return settings.autoAnalyzeSentiment;
		default:
			return false;
	}
}

export function resolveToolEnabledState(
	settings: ReturnType<typeof getBehaviorSettings>,
	tool: (typeof AI_AGENT_TOOL_CATALOG)[number]
): boolean {
	if (!(tool.isToggleable && tool.behaviorSettingKey)) {
		return true;
	}

	return getBehaviorSettingValue(settings, tool.behaviorSettingKey);
}

function toPromptDocumentResponse(
	document: AiAgentPromptDocumentSelect
): GetCapabilitiesStudioResponse["skillDocuments"][number] {
	return {
		id: document.id,
		organizationId: document.organizationId,
		websiteId: document.websiteId,
		aiAgentId: document.aiAgentId,
		kind: document.kind,
		name: document.name,
		content: document.content,
		enabled: document.enabled,
		priority: document.priority,
		createdByUserId: document.createdByUserId,
		updatedByUserId: document.updatedByUserId,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
	};
}

export function buildCapabilitiesStudioResponse(input: {
	aiAgent: AiAgentSelect;
	documents: AiAgentPromptDocumentSelect[];
	promptBundle: ResolvedPromptBundle;
}): GetCapabilitiesStudioResponse {
	const { aiAgent, documents, promptBundle } = input;
	const behaviorSettings = getBehaviorSettings(aiAgent);

	const tools = AI_AGENT_TOOL_CATALOG.map((tool) => ({
		id: tool.id,
		label: tool.label,
		description: tool.description,
		category: tool.category,
		isSystem: tool.isSystem,
		isRequired: tool.isRequired,
		isToggleable: tool.isToggleable,
		behaviorSettingKey: tool.behaviorSettingKey,
		defaultTemplateNames: [...tool.defaultTemplateNames],
		enabled: resolveToolEnabledState(behaviorSettings, tool),
	}));

	const coreDocumentsByName = new Map(
		documents
			.filter((document) => document.kind === "core")
			.map((document) => [document.name, document])
	);

	const systemSkillDocuments = AI_AGENT_SYSTEM_SKILL_METADATA.map((meta) => {
		const dbDocument = coreDocumentsByName.get(meta.name);
		const resolved = promptBundle.coreDocuments[meta.name];

		return {
			name: meta.name,
			label: meta.label,
			description: meta.description,
			content: resolved.content,
			source: resolved.source,
			enabled: dbDocument?.enabled ?? true,
			priority: dbDocument?.priority ?? resolved.priority ?? 0,
			documentId: dbDocument?.id ?? null,
		};
	});

	const skillDocuments = documents
		.filter((document) => document.kind === "skill")
		.map(toPromptDocumentResponse);

	const skillDocumentsByName = new Map(
		skillDocuments.map((document) => [document.name, document])
	);

	const defaultSkillTemplates = AI_AGENT_DEFAULT_SKILL_TEMPLATES.map(
		(template) => {
			const overrideDocument = skillDocumentsByName.get(template.name);
			const effectiveContent = overrideDocument?.content ?? template.content;

			return {
				name: template.name,
				label: template.label,
				description: template.description,
				content: effectiveContent,
				suggestedToolIds: [...template.suggestedToolIds],
				isEnabled: overrideDocument?.enabled ?? false,
				hasOverride: Boolean(overrideDocument),
				isCustomized: overrideDocument
					? overrideDocument.content.trim() !== template.content.trim()
					: false,
				skillDocumentId: overrideDocument?.id ?? null,
			};
		}
	);

	return {
		aiAgentId: aiAgent.id,
		tools,
		defaultSkillTemplates,
		systemSkillDocuments,
		skillDocuments,
	};
}
