/**
 * Tool Types
 *
 * Shared types for AI agent tools.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";

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
	/** Trigger message ID - used for idempotency keys in send-message tool */
	triggerMessageId: string;
};

/**
 * Result returned by side-effect tools
 */
export type ToolResult<T = unknown> = {
	success: boolean;
	error?: string;
	data?: T;
};
