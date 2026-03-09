import type { ConversationSelect } from "@api/db/schema/conversation";
import { emitConversationTypingEvent } from "@api/utils/conversation-realtime";

const HEARTBEAT_INTERVAL_MS = 4000;

type TypingParams = {
	conversation: ConversationSelect;
	aiAgentId: string;
};

export async function emitPipelineTypingStart(
	params: TypingParams
): Promise<void> {
	await emitConversationTypingEvent({
		conversation: params.conversation,
		actor: { type: "ai_agent", aiAgentId: params.aiAgentId },
		isTyping: true,
	});
}

export async function emitPipelineTypingStop(
	params: TypingParams
): Promise<void> {
	await emitConversationTypingEvent({
		conversation: params.conversation,
		actor: { type: "ai_agent", aiAgentId: params.aiAgentId },
		isTyping: false,
	});
}

export class PipelineTypingHeartbeat {
	private readonly conversation: ConversationSelect;
	private readonly aiAgentId: string;
	private intervalHandle: ReturnType<typeof setInterval> | null = null;
	private isRunning = false;

	constructor(params: TypingParams) {
		this.conversation = params.conversation;
		this.aiAgentId = params.aiAgentId;
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			return;
		}

		this.isRunning = true;
		try {
			await emitPipelineTypingStart({
				conversation: this.conversation,
				aiAgentId: this.aiAgentId,
			});

			this.intervalHandle = setInterval(() => {
				void emitPipelineTypingStart({
					conversation: this.conversation,
					aiAgentId: this.aiAgentId,
				}).catch((error) => {
					console.warn(
						`[ai-pipeline:typing] conv=${this.conversation.id} | Heartbeat emit failed`,
						error
					);
				});
			}, HEARTBEAT_INTERVAL_MS);
		} catch (error) {
			this.isRunning = false;
			throw error;
		}
	}

	async stop(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;

		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}

		const maxAttempts = 2;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				await emitPipelineTypingStop({
					conversation: this.conversation,
					aiAgentId: this.aiAgentId,
				});
				return;
			} catch (error) {
				if (attempt >= maxAttempts) {
					console.warn(
						`[ai-pipeline:typing] conv=${this.conversation.id} | Failed to emit typing stop`,
						error
					);
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}
	}

	get running(): boolean {
		return this.isRunning;
	}
}
