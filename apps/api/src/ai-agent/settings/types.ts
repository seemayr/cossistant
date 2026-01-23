/**
 * AI Agent Behavior Settings
 *
 * These settings control how the AI agent behaves in conversations.
 * They are stored in the behaviorSettings column of the ai_agent table.
 */

/**
 * Response mode determines when the AI should respond
 */
export type ResponseModeType =
	| "always" // Always respond to visitor messages
	| "when_no_human" // Only respond if no human agent is active
	| "on_mention" // Only respond when explicitly mentioned
	| "manual"; // Only respond to human commands

/**
 * Behavior settings for an AI agent
 */
export type AiAgentBehaviorSettings = {
	// Response triggers
	/** When should the AI respond to visitor messages */
	responseMode: ResponseModeType;
	/** Delay in milliseconds before responding (0-30000) */
	responseDelayMs: number;
	/** Enable proactive responses (greetings, follow-ups) */
	proactiveMode: boolean;

	// Human interaction
	/** Pause responding when a human agent replies */
	pauseOnHumanReply: boolean;
	/** How long to pause after human reply (minutes), null = until explicitly resumed */
	pauseDurationMinutes: number | null;

	// Capability toggles
	/** Can the AI resolve conversations */
	canResolve: boolean;
	/** Can the AI mark conversations as spam */
	canMarkSpam: boolean;
	/** Can the AI assign conversations to team members */
	canAssign: boolean;
	/** Can the AI change conversation priority */
	canSetPriority: boolean;
	/** Can the AI add conversations to views/categories */
	canCategorize: boolean;
	/** Can the AI escalate to human agents */
	canEscalate: boolean;

	// Escalation config
	/** Default user to assign when escalating (null = no default) */
	defaultEscalationUserId: string | null;
	/** Automatically assign to default user on escalation */
	autoAssignOnEscalation: boolean;

	// Background analysis (runs silently, creates private events)
	/** Automatically analyze and set conversation sentiment */
	autoAnalyzeSentiment: boolean;
	/** Automatically generate conversation titles */
	autoGenerateTitle: boolean;
	/** Automatically categorize into views based on content */
	autoCategorize: boolean;
};
