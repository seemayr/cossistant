import type { Database } from "@api/db";

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

export type PrimaryPipelineResult = {
	status: "completed" | "skipped" | "error";
	action?: string;
	reason?: string;
	error?: string;
	publicMessagesSent: number;
	retryable: boolean;
	metrics: {
		intakeMs: number;
		decisionMs: number;
		generationMs: number;
		executionMs: number;
		followupMs: number;
		totalMs: number;
	};
};

type PipelineContext = {
	db: Database;
	input: PrimaryPipelineInput;
};

/**
 * Bootstrap primary pipeline entrypoint for the AI refactor.
 * This intentionally performs no AI action yet, but marks triggers as successfully handled.
 */
export async function runPrimaryPipeline(
	ctx: PipelineContext
): Promise<PrimaryPipelineResult> {
	const startTime = Date.now();
	const { conversationId, messageId, workflowRunId, jobId } = ctx.input;

	console.log(
		`[ai-pipeline:primary] conv=${conversationId} | trigger=${messageId} | workflowRunId=${workflowRunId} | jobId=${jobId}`
	);

	return {
		status: "completed",
		publicMessagesSent: 0,
		retryable: false,
		metrics: {
			intakeMs: 0,
			decisionMs: 0,
			generationMs: 0,
			executionMs: 0,
			followupMs: 0,
			totalMs: Date.now() - startTime,
		},
	};
}
