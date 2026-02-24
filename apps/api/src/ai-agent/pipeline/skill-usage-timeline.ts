import type { Database } from "@api/db";
import { generateIdempotentULID } from "@api/utils/db/ids";
import {
	createTimelineItem,
	updateTimelineItem,
} from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	stripSkillMarkdownExtension,
	TimelineItemVisibility,
	TOOL_TIMELINE_LOG_TYPE,
} from "@cossistant/types";
import type { UsedCustomSkill } from "./3-generation";

export const AI_SKILL_USAGE_TIMELINE_TOOL_NAME = "aiSkillUsage";

function isUniqueViolationError(error: unknown): boolean {
	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string"
	) {
		return error.code === "23505";
	}

	return false;
}

function toDisplayName(skill: UsedCustomSkill): string {
	return stripSkillMarkdownExtension(skill.name);
}

function buildSummaryText(usedCustomSkills: UsedCustomSkill[]): string {
	const displayNames = usedCustomSkills.map(toDisplayName);
	return `AI used custom skills (${usedCustomSkills.length}): ${displayNames.join(", ")}`;
}

function buildProviderMetadata(params: {
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
}) {
	return {
		cossistant: {
			visibility: TimelineItemVisibility.PRIVATE,
			toolTimeline: {
				logType: TOOL_TIMELINE_LOG_TYPE.CUSTOMER_FACING,
				triggerMessageId: params.triggerMessageId,
				workflowRunId: params.workflowRunId,
				...(params.triggerVisibility
					? { triggerVisibility: params.triggerVisibility }
					: {}),
			},
		},
	};
}

function buildToolPart(params: {
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
	usedCustomSkills: UsedCustomSkill[];
}) {
	const providerMetadata = buildProviderMetadata({
		workflowRunId: params.workflowRunId,
		triggerMessageId: params.triggerMessageId,
		triggerVisibility: params.triggerVisibility,
	});

	return {
		type: `tool-${AI_SKILL_USAGE_TIMELINE_TOOL_NAME}`,
		toolCallId: "ai-skill-usage",
		toolName: AI_SKILL_USAGE_TIMELINE_TOOL_NAME,
		input: {
			totalUsedCustomSkills: params.usedCustomSkills.length,
		},
		state: "result",
		output: {
			totalUsedCustomSkills: params.usedCustomSkills.length,
			skills: params.usedCustomSkills.map((skill) => ({
				name: skill.name,
				description: skill.description,
				displayName: toDisplayName(skill),
			})),
		},
		callProviderMetadata: providerMetadata,
		providerMetadata,
	};
}

export function getAiSkillUsageTimelineItemId(workflowRunId: string): string {
	return generateIdempotentULID(`tool:${workflowRunId}:ai-skill-usage`);
}

export async function logAiSkillUsageTimeline(params: {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	visitorId: string;
	aiAgentId: string;
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
	usedCustomSkills: UsedCustomSkill[];
}): Promise<void> {
	if (params.usedCustomSkills.length === 0) {
		return;
	}

	const itemId = getAiSkillUsageTimelineItemId(params.workflowRunId);
	const text = buildSummaryText(params.usedCustomSkills);
	const toolPart = buildToolPart({
		workflowRunId: params.workflowRunId,
		triggerMessageId: params.triggerMessageId,
		triggerVisibility: params.triggerVisibility,
		usedCustomSkills: params.usedCustomSkills,
	});

	try {
		await createTimelineItem({
			db: params.db,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			conversationId: params.conversationId,
			conversationOwnerVisitorId: params.visitorId,
			item: {
				id: itemId,
				type: ConversationTimelineType.TOOL,
				text,
				parts: [toolPart],
				aiAgentId: params.aiAgentId,
				visitorId: params.visitorId,
				visibility: TimelineItemVisibility.PRIVATE,
				tool: AI_SKILL_USAGE_TIMELINE_TOOL_NAME,
			},
		});
		return;
	} catch (error) {
		if (!isUniqueViolationError(error)) {
			throw error;
		}
	}

	await updateTimelineItem({
		db: params.db,
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		conversationId: params.conversationId,
		conversationOwnerVisitorId: params.visitorId,
		itemId,
		item: {
			text,
			parts: [toolPart],
			tool: AI_SKILL_USAGE_TIMELINE_TOOL_NAME,
		},
	});
}
