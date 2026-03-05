import { updatePriority } from "@api/ai-agent/actions/update-priority";
import { updateSentiment } from "@api/ai-agent/actions/update-sentiment";
import { updateTitle } from "@api/ai-agent/actions/update-title";
import { tool } from "ai";
import { z } from "zod";
import type {
	PipelineToolContext,
	PipelineToolResult,
	ToolTelemetrySpec,
} from "./contracts";

const updateTitleInputSchema = z.object({
	title: z.string().min(1).max(100),
});

const updateSentimentInputSchema = z.object({
	sentiment: z.enum(["positive", "neutral", "negative"]),
	reason: z.string().min(1),
});

const setPriorityInputSchema = z.object({
	priority: z.enum(["low", "normal", "high", "urgent"]),
	reason: z.string().min(1),
});

export function createUpdateConversationTitleTool(ctx: PipelineToolContext) {
	return tool({
		description: "Set or update the conversation title.",
		inputSchema: updateTitleInputSchema,
		execute: async ({
			title,
		}): Promise<PipelineToolResult<{ title: string }>> => {
			await updateTitle({
				db: ctx.db,
				conversation: ctx.conversation,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				aiAgentId: ctx.aiAgentId,
				title: title.trim(),
			});
			return {
				success: true,
				data: { title: title.trim() },
			};
		},
	});
}

export function createUpdateSentimentTool(ctx: PipelineToolContext) {
	return tool({
		description: "Update conversation sentiment when useful.",
		inputSchema: updateSentimentInputSchema,
		execute: async ({
			sentiment,
			reason,
		}): Promise<PipelineToolResult<{ sentiment: string; reason: string }>> => {
			await updateSentiment({
				db: ctx.db,
				conversation: ctx.conversation,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				aiAgentId: ctx.aiAgentId,
				sentiment,
				confidence: 0.9,
			});
			return {
				success: true,
				data: { sentiment, reason },
			};
		},
	});
}

export function createSetPriorityTool(ctx: PipelineToolContext) {
	return tool({
		description: "Set conversation priority.",
		inputSchema: setPriorityInputSchema,
		execute: async ({
			priority,
			reason,
		}): Promise<PipelineToolResult<{ priority: string; reason: string }>> => {
			await updatePriority({
				db: ctx.db,
				conversation: ctx.conversation,
				organizationId: ctx.organizationId,
				websiteId: ctx.websiteId,
				aiAgentId: ctx.aiAgentId,
				newPriority: priority,
			});
			return {
				success: true,
				data: { priority, reason },
			};
		},
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTitleFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const titleCandidate =
		typeof data?.title === "string"
			? data.title
			: typeof output.title === "string"
				? output.title
				: null;

	return titleCandidate?.trim() || null;
}

function getSentimentFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const sentimentCandidate =
		typeof data?.sentiment === "string"
			? data.sentiment
			: typeof output.sentiment === "string"
				? output.sentiment
				: null;

	return sentimentCandidate?.trim() || null;
}

function getPriorityFromToolOutput(output: unknown): string | null {
	if (!isRecord(output)) {
		return null;
	}

	const data = isRecord(output.data) ? output.data : null;
	const priorityCandidate =
		typeof data?.priority === "string"
			? data.priority
			: typeof output.priority === "string"
				? output.priority
				: null;

	return priorityCandidate?.trim() || null;
}

export const UPDATE_CONVERSATION_TITLE_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Updating conversation title...",
		result: ({ output }) => {
			const title = getTitleFromToolOutput(output);
			return title
				? `Updated conversation title to "${title}"`
				: "Updated conversation title";
		},
		error: "Failed to update conversation title",
	},
	progress: {
		partial: "Updating conversation title...",
		result: "Conversation title updated",
		error: "Failed to update conversation title",
		audience: "all",
	},
};

export const UPDATE_SENTIMENT_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Updating sentiment...",
		result: ({ output }) => {
			const sentiment = getSentimentFromToolOutput(output);
			return sentiment
				? `Updated sentiment to ${sentiment}`
				: "Updated sentiment";
		},
		error: "Failed to update sentiment",
	},
	progress: {
		partial: "Analyzing sentiment...",
		result: "Sentiment updated",
		error: "Failed to update sentiment",
		audience: "all",
	},
};

export const SET_PRIORITY_TELEMETRY: ToolTelemetrySpec = {
	summary: {
		partial: "Setting priority...",
		result: ({ output }) => {
			const priority = getPriorityFromToolOutput(output);
			return priority ? `Set priority to ${priority}` : "Set priority";
		},
		error: "Failed to set priority",
	},
	progress: {
		partial: "Setting priority...",
		result: "Priority updated",
		error: "Failed to set priority",
		audience: "dashboard",
	},
};
