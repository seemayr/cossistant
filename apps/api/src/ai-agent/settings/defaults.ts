/**
 * Default Behavior Settings
 *
 * Provides sensible defaults for AI agent behavior.
 */

import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { AiAgentBehaviorSettings } from "./types";

/**
 * Default behavior settings for new AI agents
 */
export function getDefaultBehaviorSettings(): AiAgentBehaviorSettings {
	return {
		// Response triggers
		responseMode: "always",
		responseDelayMs: 3000, // 3 second delay feels natural
		proactiveMode: true, // Enable proactive responses (greetings, follow-ups)

		// Human interaction
		pauseOnHumanReply: true, // Pause when human takes over
		pauseDurationMinutes: 60, // Pause for 1 hour after human reply

		// Capability toggles - conservative defaults
		canResolve: true,
		canMarkSpam: false, // Disabled by default - risky action
		canAssign: true,
		canSetPriority: true,
		canCategorize: true,
		canEscalate: true,

		// Escalation config
		defaultEscalationUserId: null,
		autoAssignOnEscalation: true,

		// Background analysis - all enabled by default
		autoAnalyzeSentiment: true,
		autoGenerateTitle: true,
		autoCategorize: false, // Disabled by default - needs view setup first
	};
}

/**
 * Get behavior settings for an AI agent
 *
 * Merges stored settings with defaults for any missing values.
 */
export function getBehaviorSettings(
	aiAgent: AiAgentSelect
): AiAgentBehaviorSettings {
	const defaults = getDefaultBehaviorSettings();
	const stored = aiAgent.behaviorSettings;

	if (!stored) {
		return defaults;
	}

	// Merge stored with defaults
	return {
		...defaults,
		...stored,
	};
}
