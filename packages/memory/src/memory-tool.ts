import { tool } from "ai";
import { z } from "zod";
import { MemoryValidationError } from "./errors";
import type {
	CreateMemoryToolOptions,
	MemoryMetadata,
	MemoryWhere,
	RecallMemoryToolInput,
	RecallMemoryToolResult,
	RememberMemoryToolInput,
	RememberMemoryToolResult,
} from "./types";
import {
	MAX_CONTEXT_LIMIT,
	normalizeMemoryMetadata,
	normalizeMemoryWhere,
} from "./validation";

const DEFAULT_REMEMBER_DESCRIPTION = `Store a durable memory that will likely matter later.
Use this for stable facts, preferences, constraints, or decisions.
Do not store raw transcript copies, temporary phrasing, or obvious one-turn noise.
Keep memory operations invisible in user-facing replies.`;

const DEFAULT_RECALL_DESCRIPTION = `Recall durable memory before answering when prior context may matter.
Use a short natural-language query for the current situation, not a full prompt dump.
Only use recalled memory to improve the reply; keep memory operations invisible in user-facing replies.`;

const rememberInputSchema = z
	.object({
		content: z.string().trim().min(1),
		priority: z.number().int().positive().optional(),
	})
	.strict();

const recallInputSchema = z
	.object({
		text: z.string().trim().min(1).optional(),
		limit: z.number().int().min(1).max(MAX_CONTEXT_LIMIT).optional(),
		includeSummary: z.boolean().optional(),
	})
	.strict();

function normalizeBoundMetadata(metadata: MemoryMetadata): MemoryMetadata {
	const normalized = normalizeMemoryMetadata(
		metadata,
		"createMemoryTool remember.metadata"
	);

	if (Object.keys(normalized).length === 0) {
		throw new MemoryValidationError(
			"createMemoryTool remember.metadata must not be empty"
		);
	}

	return normalized;
}

function normalizeBoundWhere(where: MemoryWhere): MemoryWhere {
	return normalizeMemoryWhere(where, "createMemoryTool recall.where");
}

function normalizeRecallDefaults(
	defaults: CreateMemoryToolOptions["recall"]["defaults"]
): NonNullable<CreateMemoryToolOptions["recall"]["defaults"]> {
	if (!defaults) {
		return {};
	}

	if (
		defaults.limit !== undefined &&
		(!Number.isInteger(defaults.limit) ||
			defaults.limit <= 0 ||
			defaults.limit > MAX_CONTEXT_LIMIT)
	) {
		throw new MemoryValidationError(
			`createMemoryTool recall.defaults.limit must be an integer between 1 and ${MAX_CONTEXT_LIMIT}`
		);
	}

	if (
		defaults.includeSummary !== undefined &&
		typeof defaults.includeSummary !== "boolean"
	) {
		throw new MemoryValidationError(
			"createMemoryTool recall.defaults.includeSummary must be a boolean when provided"
		);
	}

	return defaults;
}

function toToolErrorResult(message: string): {
	success: false;
	changed: false;
	error: string;
} {
	return {
		success: false,
		changed: false,
		error: message,
	};
}

function toToolErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return "Memory tool execution failed";
}

export function createMemoryTool(options: CreateMemoryToolOptions) {
	const boundRememberMetadata = normalizeBoundMetadata(
		options.remember.metadata
	);
	const boundRecallWhere = normalizeBoundWhere(options.recall.where);
	const recallDefaults = normalizeRecallDefaults(options.recall.defaults);

	const remember = tool({
		description: options.remember.description ?? DEFAULT_REMEMBER_DESCRIPTION,
		inputSchema: rememberInputSchema,
		execute: async (
			input: RememberMemoryToolInput
		): Promise<RememberMemoryToolResult> => {
			try {
				const result = await options.memory.remember({
					content: input.content,
					priority: input.priority,
					metadata: boundRememberMetadata,
				});

				return {
					success: true,
					changed: true,
					data: result,
				};
			} catch (error) {
				return toToolErrorResult(toToolErrorMessage(error));
			}
		},
	});

	const recallMemory = tool({
		description: options.recall.description ?? DEFAULT_RECALL_DESCRIPTION,
		inputSchema: recallInputSchema,
		execute: async (
			input: RecallMemoryToolInput
		): Promise<RecallMemoryToolResult> => {
			try {
				const result = await options.memory.context({
					where: boundRecallWhere,
					text: input.text,
					limit: input.limit ?? recallDefaults.limit,
					includeSummary: input.includeSummary ?? recallDefaults.includeSummary,
				});

				return {
					success: true,
					changed: false,
					data: result,
				};
			} catch (error) {
				return toToolErrorResult(toToolErrorMessage(error));
			}
		},
	});

	return {
		remember,
		recallMemory,
	};
}
