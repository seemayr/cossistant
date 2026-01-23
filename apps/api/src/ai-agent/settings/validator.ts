/**
 * Settings Validator
 *
 * Validates and sanitizes behavior settings.
 */

import { z } from "zod";
import { getDefaultBehaviorSettings } from "./defaults";
import type { AiAgentBehaviorSettings } from "./types";

/**
 * Zod schema for behavior settings validation
 */
export const behaviorSettingsSchema = z.object({
	responseMode: z.enum(["always", "when_no_human", "on_mention", "manual"]),
	responseDelayMs: z.number().min(0).max(30_000),
	proactiveMode: z.boolean(),

	pauseOnHumanReply: z.boolean(),
	pauseDurationMinutes: z.number().min(1).max(1440).nullable(), // Max 24 hours

	canResolve: z.boolean(),
	canMarkSpam: z.boolean(),
	canAssign: z.boolean(),
	canSetPriority: z.boolean(),
	canCategorize: z.boolean(),
	canEscalate: z.boolean(),

	defaultEscalationUserId: z.string().nullable(),
	autoAssignOnEscalation: z.boolean(),

	autoAnalyzeSentiment: z.boolean(),
	autoGenerateTitle: z.boolean(),
	autoCategorize: z.boolean(),
});

/**
 * Validate and sanitize behavior settings
 *
 * Returns validated settings or throws on invalid input.
 */
export function validateBehaviorSettings(
	input: unknown
): AiAgentBehaviorSettings {
	const defaults = getDefaultBehaviorSettings();

	if (!input || typeof input !== "object") {
		return defaults;
	}

	// Parse with defaults for missing values
	const parsed = behaviorSettingsSchema.safeParse({
		...defaults,
		...input,
	});

	if (!parsed.success) {
		console.warn(
			"[ai-agent] Invalid behavior settings, using defaults:",
			parsed.error.issues
		);
		return defaults;
	}

	return parsed.data;
}
