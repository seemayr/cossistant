import type { Database } from "@api/db";
import type { GenerationTokenUsage } from "../shared/generation/contracts";

export type PrimaryPipelineInput = {
	conversationId: string;
	messageId: string;
	messageCreatedAt: string;
	websiteId: string;
	organizationId: string;
	visitorId: string;
	aiAgentId: string;
	workflowRunId: string;
	jobId: string;
};

export type PrimaryPipelineMetrics = {
	intakeMs: number;
	decisionMs: number;
	generationMs: number;
	totalMs: number;
};

export type PrimaryPipelineResult = {
	status: "completed" | "skipped" | "error";
	action?: string;
	reason?: string;
	error?: string;
	cursorDisposition: "advance" | "retry";
	publicMessagesSent: number;
	retryable: boolean;
	usageTokens?: GenerationTokenUsage;
	creditUsage?: {
		totalCredits: number;
		mode: "normal" | "outage";
		ingestStatus:
			| "ingested"
			| "failed"
			| "skipped_backoff"
			| "skipped_zero"
			| "skipped";
	};
	metrics: PrimaryPipelineMetrics;
};

export type PrimaryPipelineContext = {
	db: Database;
	input: PrimaryPipelineInput;
};

export type SenderType = "visitor" | "human_agent" | "ai_agent";

export type RoleAwareMessage = {
	messageId: string;
	content: string;
	senderType: SenderType;
	senderId: string | null;
	senderName: string | null;
	timestamp: string | null;
	visibility: "public" | "private";
};

export type VisitorContext = {
	name: string | null;
	email: string | null;
	isIdentified: boolean;
	country: string | null;
	city: string | null;
	language: string | null;
	timezone: string | null;
	browser: string | null;
	device: string | null;
	metadata: Record<string, unknown> | null;
};

export type ConversationState = {
	hasHumanAssignee: boolean;
	assigneeIds: string[];
	participantIds: string[];
	isEscalated: boolean;
	escalationReason: string | null;
};

export type ContinuationContext = {
	previousProcessedMessageId: string;
	previousProcessedMessageCreatedAt: string;
	latestAiReply: string;
};

export type ModelResolution = {
	modelIdOriginal: string;
	modelIdResolved: string;
	modelMigrationApplied: boolean;
};
