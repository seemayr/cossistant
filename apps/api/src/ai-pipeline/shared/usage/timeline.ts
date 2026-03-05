import type { Database } from "@api/db";
import type { IngestAiCreditUsageStatus } from "@api/lib/ai-credits/polar-meter";
import { generateIdempotentULID } from "@api/utils/db/ids";
import {
	createTimelineItem,
	updateTimelineItem,
} from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	getToolLogType,
	TimelineItemVisibility,
} from "@cossistant/types";

export const AI_CREDIT_USAGE_TIMELINE_TOOL_NAME = "aiCreditUsage";

export type GenerationUsageTimelinePayload = {
	workflowRunId: string;
	triggerMessageId: string;
	triggerVisibility?: "public" | "private";
	modelId: string;
	modelIdOriginal?: string;
	modelMigrationApplied?: boolean;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	tokenSource: "provider" | "fallback_constant";
	baseCredits: number;
	modelCredits: number;
	toolCredits: number;
	totalCredits: number;
	billableToolCount: number;
	excludedToolCount: number;
	totalToolCount: number;
	mode: "normal" | "outage";
	ingestStatus:
		| IngestAiCreditUsageStatus
		| "failed"
		| "skipped"
		| "skipped_zero";
	balanceBefore: number | null;
	balanceAfterEstimate: number | null;
};

function isUniqueViolationError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	if ("code" in error && typeof error.code === "string") {
		return error.code === "23505";
	}

	if ("cause" in error) {
		const cause = (error as { cause?: unknown }).cause;
		if (
			typeof cause === "object" &&
			cause !== null &&
			"code" in cause &&
			typeof cause.code === "string"
		) {
			return cause.code === "23505";
		}
	}

	if ("message" in error && typeof error.message === "string") {
		return error.message.toLowerCase().includes("duplicate key");
	}

	return false;
}

function getTimelineItemId(workflowRunId: string): string {
	return generateIdempotentULID(`tool:${workflowRunId}:ai-credit-usage`);
}

function buildToolPart(payload: GenerationUsageTimelinePayload) {
	const providerMetadata = {
		cossistant: {
			visibility: TimelineItemVisibility.PRIVATE,
			toolTimeline: {
				logType: getToolLogType(AI_CREDIT_USAGE_TIMELINE_TOOL_NAME),
				workflowRunId: payload.workflowRunId,
				triggerMessageId: payload.triggerMessageId,
				...(payload.triggerVisibility
					? { triggerVisibility: payload.triggerVisibility }
					: {}),
			},
		},
	};

	return {
		type: `tool-${AI_CREDIT_USAGE_TIMELINE_TOOL_NAME}`,
		toolCallId: "ai-credit-usage",
		toolName: AI_CREDIT_USAGE_TIMELINE_TOOL_NAME,
		state: "result",
		input: {
			workflowRunId: payload.workflowRunId,
			triggerMessageId: payload.triggerMessageId,
			modelId: payload.modelId,
		},
		output: payload,
		callProviderMetadata: providerMetadata,
		providerMetadata,
	};
}

function buildTimelineText(payload: GenerationUsageTimelinePayload): string {
	return `AI usage: ${payload.totalTokens} tokens, ${payload.totalCredits} credits`;
}

export async function logGenerationUsageTimeline(params: {
	db: Database;
	organizationId: string;
	websiteId: string;
	conversationId: string;
	visitorId: string;
	aiAgentId: string;
	payload: GenerationUsageTimelinePayload;
}): Promise<void> {
	const itemId = getTimelineItemId(params.payload.workflowRunId);
	const part = buildToolPart(params.payload);
	const text = buildTimelineText(params.payload);

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
				parts: [part],
				aiAgentId: params.aiAgentId,
				visitorId: params.visitorId,
				visibility: TimelineItemVisibility.PRIVATE,
				tool: AI_CREDIT_USAGE_TIMELINE_TOOL_NAME,
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
			parts: [part],
			tool: AI_CREDIT_USAGE_TIMELINE_TOOL_NAME,
		},
	});
}
