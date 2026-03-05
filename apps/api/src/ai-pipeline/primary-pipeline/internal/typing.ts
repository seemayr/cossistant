import type { ConversationSelect } from "@api/db/schema/conversation";
import { logAiPipeline } from "../../logger";
import { PipelineTypingHeartbeat } from "../../shared/events";

export type PrimaryTypingControls = {
	startTyping?: () => Promise<void>;
	stopTyping?: () => Promise<void>;
	stopSafely: () => Promise<void>;
};

export function createPrimaryTypingControls(params: {
	allowPublicMessages: boolean;
	conversation: ConversationSelect;
	aiAgentId: string;
	conversationId: string;
}): PrimaryTypingControls {
	let typingHeartbeat: PipelineTypingHeartbeat | null = null;

	const ensureHeartbeat = (): PipelineTypingHeartbeat => {
		if (!typingHeartbeat) {
			typingHeartbeat = new PipelineTypingHeartbeat({
				conversation: params.conversation,
				aiAgentId: params.aiAgentId,
			});
		}
		return typingHeartbeat;
	};

	const startTyping = async (): Promise<void> => {
		if (!params.allowPublicMessages) {
			return;
		}

		const heartbeat = ensureHeartbeat();
		if (!heartbeat.running) {
			await heartbeat.start();
		}
	};

	const stopTyping = async (): Promise<void> => {
		if (typingHeartbeat) {
			await typingHeartbeat.stop();
		}
	};

	const stopSafely = async (): Promise<void> => {
		try {
			if (typingHeartbeat) {
				await typingHeartbeat.stop();
			}
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

	if (!params.allowPublicMessages) {
		return {
			stopSafely,
		};
	}

	return {
		startTyping,
		stopTyping,
		stopSafely,
	};
}

export async function startPrimaryTypingSafely(params: {
	conversationId: string;
	controls: PrimaryTypingControls;
}): Promise<void> {
	if (!params.controls.startTyping) {
		return;
	}

	try {
		await params.controls.startTyping();
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
}
