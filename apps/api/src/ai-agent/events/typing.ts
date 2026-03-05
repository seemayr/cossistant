/**
 * Typing Events
 *
 * Emits typing indicator events for the AI agent.
 * Includes a heartbeat mechanism to keep typing indicators alive during long operations.
 */

import type { ConversationSelect } from "@api/db/schema/conversation";
import { emitConversationTypingEvent } from "@api/utils/conversation-realtime";

type TypingParams = {
	conversation: ConversationSelect;
	aiAgentId: string;
};

/**
 * Emit typing start event
 */
export async function emitTypingStart(params: TypingParams): Promise<void> {
	await emitConversationTypingEvent({
		conversation: params.conversation,
		actor: { type: "ai_agent", aiAgentId: params.aiAgentId },
		isTyping: true,
	});
}

/**
 * Emit typing stop event
 */
export async function emitTypingStop(params: TypingParams): Promise<void> {
	await emitConversationTypingEvent({
		conversation: params.conversation,
		actor: { type: "ai_agent", aiAgentId: params.aiAgentId },
		isTyping: false,
	});
}

/**
 * Heartbeat interval in milliseconds.
 * Client-side TTL is 6 seconds, so we send heartbeats every 4 seconds
 * to ensure the typing indicator stays visible.
 */
const HEARTBEAT_INTERVAL_MS = 4000;

/**
 * Typing Heartbeat
 *
 * Keeps the typing indicator alive during long-running operations (like LLM generation).
 * Sends periodic typing events to prevent the client from timing out the indicator.
 *
 * Usage:
 * ```ts
 * const heartbeat = new TypingHeartbeat({ conversation, aiAgentId });
 * await heartbeat.start();
 * try {
 *   await longRunningOperation();
 * } finally {
 *   await heartbeat.stop();
 * }
 * ```
 */
export class TypingHeartbeat {
	private readonly conversation: ConversationSelect;
	private readonly aiAgentId: string;
	private intervalHandle: ReturnType<typeof setInterval> | null = null;
	private isRunning = false;
	private desiredRunning = false;
	private typingVisible = false;
	private transitionChain: Promise<void> = Promise.resolve();

	constructor(params: TypingParams) {
		this.conversation = params.conversation;
		this.aiAgentId = params.aiAgentId;
	}

	/**
	 * Start the typing heartbeat.
	 * Immediately emits a typing event and schedules periodic heartbeats.
	 */
	async start(): Promise<void> {
		this.desiredRunning = true;
		await this.enqueueTransition(async () => {
			if (this.isRunning) {
				return;
			}
			this.isRunning = true;

			const convId = this.conversation.id;
			console.log(
				`[ai-agent:typing] conv=${convId} | Starting heartbeat | interval=${HEARTBEAT_INTERVAL_MS}ms`
			);

			try {
				// Emit immediately
				await this.emitTyping();

				// A stop was requested while start was in-flight.
				if (!this.desiredRunning) {
					this.isRunning = false;
					return;
				}

				// Schedule periodic heartbeats
				this.intervalHandle = setInterval(() => {
					if (!(this.isRunning && this.desiredRunning)) {
						return;
					}
					console.log(`[ai-agent:typing] conv=${convId} | Heartbeat tick`);
					// Fire-and-forget, don't await in interval
					this.emitTyping().catch((err) => {
						console.warn(
							`[ai-agent:typing] conv=${convId} | Failed to emit heartbeat: ${err instanceof Error ? err.message : "Unknown error"}`
						);
					});
				}, HEARTBEAT_INTERVAL_MS);
				this.intervalHandle.unref?.();
			} catch (error) {
				this.isRunning = false;
				if (this.intervalHandle) {
					clearInterval(this.intervalHandle);
					this.intervalHandle = null;
				}
				throw error;
			}
		});
	}

	/**
	 * Stop the typing heartbeat and emit typing stop event.
	 * Includes retry logic to ensure the stop event is delivered.
	 */
	async stop(): Promise<void> {
		this.desiredRunning = false;
		await this.enqueueTransition(async () => {
			if (!(this.isRunning || this.intervalHandle || this.typingVisible)) {
				return;
			}
			this.isRunning = false;

			const convId = this.conversation.id;
			console.log(`[ai-agent:typing] conv=${convId} | Stopping heartbeat`);

			// Clear the interval FIRST to prevent any more heartbeats
			if (this.intervalHandle) {
				clearInterval(this.intervalHandle);
				this.intervalHandle = null;
			}

			// Emit stop event with retry for reliability
			const MAX_RETRIES = 2;
			for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
				try {
					await emitTypingStop({
						conversation: this.conversation,
						aiAgentId: this.aiAgentId,
					});
					console.log(
						`[ai-agent:typing] conv=${convId} | Typing stopped (attempt ${attempt})`
					);
					this.typingVisible = false;
					return; // Success, exit
				} catch (error) {
					console.error(
						`[ai-agent:typing] conv=${convId} | Failed to emit typing stop (attempt ${attempt}/${MAX_RETRIES}):`,
						error
					);
					if (attempt < MAX_RETRIES) {
						// Brief delay before retry
						await new Promise((resolve) => setTimeout(resolve, 100));
					}
				}
			}
			// All retries failed - client's 6-second TTL will eventually clear it
			console.warn(
				`[ai-agent:typing] conv=${convId} | All stop attempts failed, relying on client TTL`
			);
		});
	}

	/**
	 * Check if heartbeat is currently running.
	 */
	get running(): boolean {
		return this.isRunning;
	}

	private async enqueueTransition(run: () => Promise<void>): Promise<void> {
		const queued = this.transitionChain.then(run, run);
		this.transitionChain = queued.then(
			() => {},
			() => {}
		);
		await queued;
	}

	private async emitTyping(): Promise<void> {
		const convId = this.conversation.id;
		const visitorId = this.conversation.visitorId;
		const websiteId = this.conversation.websiteId;
		const organizationId = this.conversation.organizationId;

		// Verify required fields are present for event routing
		if (!(visitorId && websiteId && organizationId)) {
			console.error(
				`[ai-agent:typing] conv=${convId} | Missing required fields for typing event | visitorId=${visitorId} | websiteId=${websiteId} | organizationId=${organizationId}`
			);
			return;
		}

		console.log(
			`[ai-agent:typing] conv=${convId} | Emitting typing event | visitorId=${visitorId} | websiteId=${websiteId} | aiAgentId=${this.aiAgentId}`
		);

		try {
			await emitConversationTypingEvent({
				conversation: this.conversation,
				actor: { type: "ai_agent", aiAgentId: this.aiAgentId },
				isTyping: true,
			});
			this.typingVisible = true;
			console.log(
				`[ai-agent:typing] conv=${convId} | Typing event emitted successfully`
			);
		} catch (error) {
			console.error(
				`[ai-agent:typing] conv=${convId} | Failed to emit typing event:`,
				error
			);
			throw error;
		}
	}
}
