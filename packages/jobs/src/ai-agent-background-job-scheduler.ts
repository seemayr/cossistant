import type { JobsOptions, Queue } from "bullmq";
import type { AiAgentBackgroundJobData } from "./types";
import { generateAiAgentBackgroundJobId } from "./types";

export const AI_AGENT_BACKGROUND_DELAY_MS = 30_000;

export const AI_AGENT_BACKGROUND_JOB_OPTIONS: JobsOptions = {
	delay: AI_AGENT_BACKGROUND_DELAY_MS,
	attempts: 1,
	removeOnComplete: true,
	removeOnFail: true,
};

export type EnqueueConversationScopedAiBackgroundJobResult =
	| {
			status: "created";
	  }
	| {
			status: "rescheduled";
			previousState: "delayed" | "waiting";
	  }
	| {
			status: "skipped_active";
	  }
	| {
			status: "skipped_unexpected";
			existingState: string;
	  };

export async function enqueueConversationScopedAiBackgroundJob(params: {
	queue: Queue<AiAgentBackgroundJobData>;
	data: AiAgentBackgroundJobData;
	delayMs?: number;
}): Promise<EnqueueConversationScopedAiBackgroundJobResult> {
	const jobId = generateAiAgentBackgroundJobId(params.data.conversationId);
	const existingJob = await params.queue.getJob(jobId);

	if (existingJob) {
		const state = await existingJob.getState();

		if (state === "active") {
			return { status: "skipped_active" };
		}

		if (state === "delayed" || state === "waiting") {
			await existingJob.remove();
			await params.queue.add("ai-agent-background", params.data, {
				...AI_AGENT_BACKGROUND_JOB_OPTIONS,
				jobId,
				delay: params.delayMs ?? AI_AGENT_BACKGROUND_DELAY_MS,
			});
			return { status: "rescheduled", previousState: state };
		}

		if (state === "completed" || state === "failed") {
			await existingJob.remove();
		} else {
			return { status: "skipped_unexpected", existingState: state };
		}
	}

	await params.queue.add("ai-agent-background", params.data, {
		...AI_AGENT_BACKGROUND_JOB_OPTIONS,
		jobId,
		delay: params.delayMs ?? AI_AGENT_BACKGROUND_DELAY_MS,
	});

	return { status: "created" };
}
