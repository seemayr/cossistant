import type { Database } from "@api/db";

export type BackgroundPipelineInput = {
	conversationId: string;
	websiteId: string;
	organizationId: string;
	aiAgentId: string;
	workflowRunId: string;
	jobId: string;
};

export type BackgroundPipelineResult = {
	status: "completed" | "skipped" | "error";
	reason?: string;
	error?: string;
	metrics: {
		intakeMs: number;
		analysisMs: number;
		executionMs: number;
		totalMs: number;
	};
};

type BackgroundPipelineContext = {
	db: Database;
	input: BackgroundPipelineInput;
};

/**
 * Background pipeline shell.
 * Scheduling and queue orchestration are implemented first; triage actions will be added later.
 */
export async function runBackgroundPipeline(
	ctx: BackgroundPipelineContext
): Promise<BackgroundPipelineResult> {
	const startTime = Date.now();
	const { conversationId, workflowRunId, jobId } = ctx.input;

	console.log(
		`[ai-pipeline:background] conv=${conversationId} | workflowRunId=${workflowRunId} | jobId=${jobId} | status=completed | mode=shell`
	);

	return {
		status: "completed",
		metrics: {
			intakeMs: 0,
			analysisMs: 0,
			executionMs: 0,
			totalMs: Date.now() - startTime,
		},
	};
}
