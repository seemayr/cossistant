/**
 * Tool Types
 *
 * Shared types for AI agent tools.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";

/**
 * Mutable counters for message idempotency within a single generation.
 * Using an object allows counters to be shared and mutated across tool calls.
 */
export type MessageCounters = {
	sendMessage: number;
	sendPrivateMessage: number;
};

export type CapturedAction = {
	action: "respond" | "escalate" | "resolve" | "mark_spam" | "skip";
	reasoning: string;
	confidence: number;
	escalation?: { reason: string; urgency?: "normal" | "high" | "urgent" };
};

export type ActionCapture = {
	get: () => CapturedAction | null;
	set: (action: CapturedAction) => void;
	reset: () => void;
};

/**
 * Callback to stop the typing indicator.
 * Called just before a message is sent so typing doesn't linger.
 */
export type StopTypingCallback = () => Promise<void>;

/**
 * Callback to start/restart the typing indicator.
 * Called before inter-message delays so users see typing between messages.
 */
export type StartTypingCallback = () => Promise<void>;

export type PublicMessageSentCallback = (params: {
	messageId: string;
	created: boolean;
	duplicateSuppressed?: boolean;
}) => void;

/**
 * Context passed to all tools via experimental_context
 */
export type ToolContext = {
	db: Database;
	conversation: ConversationSelect;
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	aiAgentId: string;
	/** Whether public visitor messages are allowed in this run */
	allowPublicMessages: boolean;
	/** Trigger message ID - used for idempotency keys in send-message tool */
	triggerMessageId: string;
	/** Trigger message timestamp - used for sequencing safeguards */
	triggerMessageCreatedAt?: string;
	/** Trigger sender type - used for stale trigger suppression */
	triggerSenderType?: "visitor" | "human_agent" | "ai_agent";
	/** Trigger visibility - public/private */
	triggerVisibility?: "public" | "private";
	/** Workflow run ID - used for progress events */
	workflowRunId?: string;
	/**
	 * Mutable counters for message idempotency - shared across tool calls.
	 * May be undefined in edge cases (hot reload), tools should initialize defensively.
	 */
	counters?: MessageCounters;
	/**
	 * Callback to stop the typing indicator just before a message is sent.
	 * Prevents typing from lingering after the message is already visible.
	 */
	stopTyping?: StopTypingCallback;
	/**
	 * Callback to start/restart the typing indicator.
	 * Used to show typing during inter-message delays so users see
	 * the AI is still working on subsequent messages.
	 */
	startTyping?: StartTypingCallback;
	/**
	 * Called when a public message send succeeds or resolves to an existing
	 * idempotent message. Lets the pipeline classify retryability correctly.
	 */
	onPublicMessageSent?: PublicMessageSentCallback;
	/** Whether the conversation is already escalated - prevents re-escalation */
	isEscalated?: boolean;
	/** Per-generation captured action store */
	actionCapture?: ActionCapture;
};

/**
 * Result returned by side-effect tools
 */
export type ToolResult<T = unknown> = {
	success: boolean;
	error?: string;
	data?: T;
};
