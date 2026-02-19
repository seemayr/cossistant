// Queue names registry
export const QUEUE_NAMES = {
	MESSAGE_NOTIFICATION: "message-notification",
	AI_AGENT: "ai-agent",
	WEB_CRAWL: "web-crawl",
	AI_TRAINING: "ai-training",
} as const;

/**
 * Direction of the message notification
 */
export type MessageNotificationDirection =
	| "member-to-visitor"
	| "visitor-to-member";

/**
 * Job data for message notification queue
 */
export type MessageNotificationJobData = {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
	direction: MessageNotificationDirection;
	senderId?: string;
	visitorId?: string;
	initialMessageCreatedAt: string;
};

/**
 * Generate a unique job ID for message notification
 */
export function generateMessageNotificationJobId(
	conversationId: string,
	direction: MessageNotificationDirection
): string {
	return `msg-notif-${conversationId}-${direction}`;
}

/**
 * Job data for AI Agent queue
 *
 * The AI agent can:
 * - Respond to visitor messages
 * - Analyze conversations (sentiment, title)
 * - Escalate to humans
 * - Execute background tasks
 */
export type AiAgentJobData = {
	conversationId: string;
	websiteId: string;
	organizationId: string;
	aiAgentId: string;
	/**
	 * Optional trigger message ID that woke this drain job.
	 * Keeps wake jobs idempotent per trigger while preserving compatibility
	 * with older producers that only enqueue by conversation.
	 */
	triggerMessageId?: string;
	/**
	 * Optional wait-resume marker.
	 * When present, worker selects the latest queued trigger on first pass
	 * after a deferred wait cycle.
	 */
	waitResumeForTriggerMessageId?: string;
};

export function generateAiAgentJobId(
	conversationId: string,
	triggerMessageId?: string
): string {
	if (triggerMessageId) {
		return `ai-agent-${conversationId}-${triggerMessageId}`;
	}

	return `ai-agent-${conversationId}`;
}

/**
 * Job data for web crawl queue
 */
export type WebCrawlJobData = {
	linkSourceId: string;
	websiteId: string;
	organizationId: string;
	aiAgentId: string | null;
	url: string;
	crawlLimit: number;
	createdBy: string; // userId who triggered
	// Path filters
	includePaths?: string[] | null;
	excludePaths?: string[] | null;
	// Firecrawl v2 parameters
	/** Maximum depth of links to follow from the starting URL - default: 5 */
	maxDepth?: number;
};

/**
 * Generate a unique job ID for web crawl
 */
export function generateWebCrawlJobId(linkSourceId: string): string {
	return `web-crawl-${linkSourceId}`;
}

/**
 * Job data for AI training queue
 *
 * Processes knowledge base items to generate embeddings
 * and store them in the vector database for RAG.
 */
export type AiTrainingJobData = {
	websiteId: string;
	organizationId: string;
	aiAgentId: string;
	triggeredBy: string; // userId who triggered
};

/**
 * Generate a unique job ID for AI training
 */
export function generateAiTrainingJobId(aiAgentId: string): string {
	return `ai-training-${aiAgentId}`;
}
