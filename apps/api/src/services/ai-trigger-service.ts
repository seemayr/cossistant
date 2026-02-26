import { isAiPausedForConversation } from "@api/ai-agent/kill-switch";
import { db } from "@api/db";
import { updateConversationAiCursor } from "@api/db/mutations/conversation";
import { getActiveAiAgentForWebsite } from "@api/db/queries/ai-agent";
import { getRedis } from "@api/redis";
import { getAiAgentQueueTriggers } from "@api/utils/queue-triggers";
import {
	clearAiAgentWakeNeeded,
	enqueueAiAgentMessage,
	markAiAgentWakeNeeded,
} from "@cossistant/jobs";

const MAX_ENQUEUE_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 150;
const WAKE_NEEDED_TTL_SECONDS = 300;

export type EnqueueAiTriggerParams = {
	conversationId: string;
	messageId: string;
	messageCreatedAt: string;
	websiteId: string;
	organizationId: string;
};

export type EnqueueAiTriggerResult = {
	status: "queued" | "alreadyQueued" | "recoveryMarked" | "skipped";
	recoveryMarked: boolean;
	reason?: "no_active_agent" | "paused";
	aiAgentId?: string;
};

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

async function sleep(ms: number): Promise<void> {
	if (ms <= 0) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number): number {
	const exponentialDelay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
	const jitter = Math.floor(Math.random() * BASE_RETRY_DELAY_MS);
	return exponentialDelay + jitter;
}

export async function enqueueAiAgentTrigger(
	params: EnqueueAiTriggerParams
): Promise<EnqueueAiTriggerResult> {
	const redis = getRedis();

	const aiAgent = await getActiveAiAgentForWebsite(db, {
		websiteId: params.websiteId,
		organizationId: params.organizationId,
	});

	if (!aiAgent) {
		return {
			status: "skipped",
			reason: "no_active_agent",
			recoveryMarked: false,
		};
	}

	const isPaused = await isAiPausedForConversation({
		db,
		redis,
		conversationId: params.conversationId,
	});
	if (isPaused) {
		await updateConversationAiCursor(db, {
			conversationId: params.conversationId,
			organizationId: params.organizationId,
			messageId: params.messageId,
			messageCreatedAt: params.messageCreatedAt,
		});
		return {
			status: "skipped",
			reason: "paused",
			recoveryMarked: false,
			aiAgentId: aiAgent.id,
		};
	}

	const triggerData = {
		conversationId: params.conversationId,
		websiteId: params.websiteId,
		organizationId: params.organizationId,
		aiAgentId: aiAgent.id,
		triggerMessageId: params.messageId,
	};

	for (let attempt = 1; attempt <= MAX_ENQUEUE_ATTEMPTS; attempt++) {
		let failureStage: "queue" | "wake" = "queue";
		try {
			const queueResult = await enqueueAiAgentMessage(redis, {
				conversationId: params.conversationId,
				messageId: params.messageId,
				messageCreatedAt: params.messageCreatedAt,
			});

			failureStage = "wake";
			const wakeResult =
				await getAiAgentQueueTriggers().enqueueAiAgentJob(triggerData);
			await clearAiAgentWakeNeeded(redis, params.conversationId);

			if (wakeResult.status === "created" && queueResult.added) {
				return {
					status: "queued",
					recoveryMarked: false,
					aiAgentId: aiAgent.id,
				};
			}

			return {
				status: "alreadyQueued",
				recoveryMarked: false,
				aiAgentId: aiAgent.id,
			};
		} catch (error) {
			console.error("[ai-trigger-service] enqueue_failed", {
				conversationId: params.conversationId,
				messageId: params.messageId,
				attempt,
				maxAttempts: MAX_ENQUEUE_ATTEMPTS,
				failureStage,
				error: getErrorMessage(error),
			});

			if (attempt < MAX_ENQUEUE_ATTEMPTS) {
				await sleep(getRetryDelayMs(attempt));
			}
		}
	}

	try {
		await markAiAgentWakeNeeded(redis, {
			conversationId: params.conversationId,
			ttlSeconds: WAKE_NEEDED_TTL_SECONDS,
		});
	} catch (error) {
		console.error("[ai-trigger-service] mark_wake_needed_failed", {
			conversationId: params.conversationId,
			messageId: params.messageId,
			error: getErrorMessage(error),
		});
	}

	return {
		status: "recoveryMarked",
		recoveryMarked: true,
		aiAgentId: aiAgent.id,
	};
}
