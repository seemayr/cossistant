import type { ConversationSelect } from "@api/db/schema/conversation";
import { logAiPipeline } from "../../logger";
import {
	emitPipelineTypingStop,
	PipelineTypingHeartbeat,
} from "../../shared/events";

export type PrimaryTypingControls = {
	startSafely: () => Promise<void>;
	stopTyping?: () => Promise<void>;
	stopSafely: () => Promise<void>;
};

export function createPrimaryTypingControls(params: {
	allowPublicMessages: boolean;
	conversation: ConversationSelect;
	aiAgentId: string;
	conversationId: string;
}): PrimaryTypingControls {
	if (!params.allowPublicMessages) {
		const noop = async (): Promise<void> => {};
		return {
			startSafely: noop,
			stopSafely: noop,
		};
	}

	const heartbeat = new PipelineTypingHeartbeat({
		conversation: params.conversation,
		aiAgentId: params.aiAgentId,
	});
	let hasStopped = false;

	const startTyping = async (): Promise<void> => {
		if (hasStopped || heartbeat.running) {
			return;
		}

		await heartbeat.start();
	};

	const stopTyping = async (): Promise<void> => {
		if (hasStopped) {
			return;
		}

		hasStopped = true;

		if (heartbeat.running) {
			await heartbeat.stop();
			return;
		}

		await emitPipelineTypingStop({
			conversation: params.conversation,
			aiAgentId: params.aiAgentId,
		});
	};

	const startSafely = async (): Promise<void> => {
		try {
			await startTyping();
		} catch (error) {
			logAiPipeline({
				area: "primary",
				event: "typing_start_failed",
				level: "warn",
				conversationId: params.conversationId,
				fields: {
					stage: "typing",
				},
				error,
			});
		}
	};

	const stopSafely = async (): Promise<void> => {
		try {
			await stopTyping();
		} catch (error) {
			logAiPipeline({
				area: "primary",
				event: "typing_stop_failed",
				level: "warn",
				conversationId: params.conversationId,
				fields: {
					stage: "typing",
				},
				error,
			});
		}
	};

	return {
		startSafely,
		stopTyping,
		stopSafely,
	};
}
