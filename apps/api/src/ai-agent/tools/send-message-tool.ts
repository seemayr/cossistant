/**
 * Send Message Tool
 *
 * Sends a public message to the visitor.
 * Includes natural delays between messages to simulate human typing.
 */

import { getLatestPublicVisitorMessageId } from "@api/db/queries/conversation";
import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, ToolResult } from "./types";

/**
 * Calculate a natural typing delay based on message length.
 * Simulates human typing speed (~50-60 WPM).
 */
function calculateTypingDelay(messageLength: number): number {
	const MIN_DELAY_MS = 800; // Minimum pause between messages
	const MAX_DELAY_MS = 2500; // Maximum pause (don't make user wait too long)
	const CHARS_PER_SECOND = 25; // ~50 WPM, adjusted for natural reading pauses

	// Base delay on message length
	const typingTimeMs = (messageLength / CHARS_PER_SECOND) * 1000;

	// Clamp between min and max
	return Math.max(MIN_DELAY_MS, Math.min(typingTimeMs, MAX_DELAY_MS));
}

/**
 * Sleep for a given duration.
 */
async function interruptibleSleep(durationMs: number): Promise<void> {
	const POLL_INTERVAL_MS = 200; // Check every 200ms if we should abort
	let elapsed = 0;

	while (elapsed < durationMs) {
		const sleepTime = Math.min(POLL_INTERVAL_MS, durationMs - elapsed);
		await new Promise((resolve) => setTimeout(resolve, sleepTime));
		elapsed += sleepTime;
	}
}

function normalizeMessageForDedup(message: string): string {
	return message.toLowerCase().replace(/\s+/g, " ").trim();
}

async function isSupersededVisitorTrigger(ctx: ToolContext): Promise<boolean> {
	if (ctx.triggerSenderType !== "visitor") {
		return false;
	}

	if (ctx.triggerVisibility && ctx.triggerVisibility !== "public") {
		return false;
	}

	const latestVisitorMessageId = await getLatestPublicVisitorMessageId(ctx.db, {
		conversationId: ctx.conversationId,
		organizationId: ctx.organizationId,
	});

	if (!latestVisitorMessageId) {
		return false;
	}

	return latestVisitorMessageId !== ctx.triggerMessageId;
}

const inputSchema = z.object({
	message: z
		.string()
		.describe(
			"The message text to send to the visitor. Keep each message to 1-2 sentences for readability."
		),
});

/**
 * Create the sendMessage tool
 *
 * Uses counters from ToolContext instead of module-level state to ensure
 * proper isolation in worker/serverless environments.
 */
export function createSendMessageTool(ctx: ToolContext) {
	const sentNormalizedMessages = new Set<string>();
	let sendChain: Promise<void> = Promise.resolve();
	let nextCreatedAtMs = Date.now();

	const runSequentially = async <T>(op: () => Promise<T>): Promise<T> => {
		const queued = sendChain.then(op);
		sendChain = queued.then(
			() => {},
			() => {}
		);
		return queued;
	};

	return tool({
		description:
			"REQUIRED: Send a visible message to the visitor. The visitor ONLY sees messages sent through this tool. Call this BEFORE any action tool (respond, escalate, resolve). If sending multiple messages, call this tool in the exact final display order and ensure each message adds new information.",
		inputSchema,
		execute: ({ message }) =>
			runSequentially<
				ToolResult<{
					sent: boolean;
					messageId: string;
					duplicateSuppressed?: boolean;
					staleTriggerSuppressed?: boolean;
				}>
			>(async () => {
				try {
					if (!ctx.allowPublicMessages) {
						console.warn(
							`[tool:sendMessage] conv=${ctx.conversationId} | Public messages not allowed for this workflow`
						);
						return {
							success: false,
							error: "Public messages are not allowed for this workflow",
							data: { sent: false, messageId: "" },
						};
					}

					// Defensive initialization for counters (handles hot reload edge cases)
					const counters = ctx.counters ?? {
						sendMessage: 0,
						sendPrivateMessage: 0,
					};
					if (!ctx.counters) {
						ctx.counters = counters;
					}

					const normalizedMessage = normalizeMessageForDedup(message);
					if (!normalizedMessage) {
						return {
							success: false,
							error: "Message cannot be empty",
						};
					}

					if (sentNormalizedMessages.has(normalizedMessage)) {
						console.log(
							`[tool:sendMessage] conv=${ctx.conversationId} | Duplicate normalized message suppressed`
						);
						return {
							success: true,
							data: {
								sent: false,
								messageId: "",
								duplicateSuppressed: true,
							},
						};
					}

					const messageNumber = counters.sendMessage + 1;
					const uniqueKey = `public:${ctx.triggerMessageId}:slot:${messageNumber}`;

					// For subsequent messages (not the first one), add a natural delay
					// with typing indicator to simulate human conversation pacing.
					if (messageNumber > 1) {
						const delayMs = calculateTypingDelay(message.length);
						console.log(
							`[tool:sendMessage] conv=${ctx.conversationId} | Message #${messageNumber}: typing for ${delayMs}ms`
						);

						if (ctx.startTyping) {
							await ctx.startTyping();
						}

						await interruptibleSleep(delayMs);
					}

					if (await isSupersededVisitorTrigger(ctx)) {
						console.log(
							`[tool:sendMessage] conv=${ctx.conversationId} | Suppressing send for stale trigger ${ctx.triggerMessageId}`
						);
						return {
							success: true,
							data: {
								sent: false,
								messageId: "",
								staleTriggerSuppressed: true,
							},
						};
					}

					nextCreatedAtMs = Math.max(nextCreatedAtMs + 1, Date.now());
					const createdAt = new Date(nextCreatedAtMs);

					console.log(
						`[tool:sendMessage] conv=${ctx.conversationId} | sending #${messageNumber}`
					);

					const { sendMessage } = await import("../actions/send-message");
					const result = await sendMessage({
						db: ctx.db,
						conversationId: ctx.conversationId,
						organizationId: ctx.organizationId,
						websiteId: ctx.websiteId,
						visitorId: ctx.visitorId,
						aiAgentId: ctx.aiAgentId,
						text: message,
						idempotencyKey: uniqueKey,
						createdAt,
					});
					if (result.paused) {
						return {
							success: false,
							error: "AI is paused for this conversation",
							data: { sent: false, messageId: result.messageId },
						};
					}

					// Count this normalized payload once the send resolves. This includes
					// idempotent existing messages (`created=false`) which means the
					// visitor already has the reply.
					sentNormalizedMessages.add(normalizedMessage);
					counters.sendMessage = messageNumber;
					ctx.onPublicMessageSent?.({
						messageId: result.messageId,
						created: result.created,
					});

					console.log(
						`[tool:sendMessage] conv=${ctx.conversationId} | sent=${result.created}`
					);

					return {
						success: true,
						data: { sent: result.created, messageId: result.messageId },
					};
				} catch (error) {
					console.error(
						`[tool:sendMessage] conv=${ctx.conversationId} | Failed:`,
						error
					);
					return {
						success: false,
						error:
							error instanceof Error ? error.message : "Failed to send message",
					};
				} finally {
					if (ctx.stopTyping) {
						try {
							await ctx.stopTyping();
						} catch (error) {
							console.warn(
								`[tool:sendMessage] conv=${ctx.conversationId} | Failed to stop typing in cleanup:`,
								error
							);
						}
					}
				}
			}),
	});
}
