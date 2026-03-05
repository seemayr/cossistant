import type { JobsOptions, Queue } from "bullmq";
import type { AiAgentJobData } from "./types";
import { generateAiAgentJobId } from "./types";

export const AI_AGENT_INITIAL_DELAY_MS = 300;
export const AI_AGENT_RETRY_DELAY_MS = 5000;
export const AI_AGENT_MAX_RUN_ATTEMPTS = 3;

export const AI_AGENT_JOB_OPTIONS: JobsOptions = {
	delay: AI_AGENT_INITIAL_DELAY_MS,
	attempts: 1,
	removeOnComplete: true,
	removeOnFail: true,
};

export type EnqueueConversationScopedAiJobResult =
	| {
			status: "created";
	  }
	| {
			status: "skipped";
			existingState: string;
	  };

export async function enqueueConversationScopedAiJob(params: {
	queue: Queue<AiAgentJobData>;
	data: AiAgentJobData;
	delayMs?: number;
}): Promise<EnqueueConversationScopedAiJobResult> {
	const jobId = generateAiAgentJobId(params.data.conversationId);
	const existingJob = await params.queue.getJob(jobId);

	if (existingJob) {
		const state = await existingJob.getState();
		if (state === "active" || state === "waiting" || state === "delayed") {
			return { status: "skipped", existingState: state };
		}

		if (state === "completed" || state === "failed") {
			await existingJob.remove();
		} else {
			return { status: "skipped", existingState: state };
		}
	}

	await params.queue.add("ai-agent", params.data, {
		...AI_AGENT_JOB_OPTIONS,
		jobId,
		delay: params.delayMs ?? AI_AGENT_INITIAL_DELAY_MS,
	});

	return { status: "created" };
}
