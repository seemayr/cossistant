/**
 * Send Message Tool
 *
 * Sends a public message to the visitor.
 */

import { getLatestPublicVisitorMessageId } from "@api/db/queries/conversation";
import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, ToolResult } from "./types";

const MIN_ADAPTIVE_DELAY_MS = 650;
const MAX_ADAPTIVE_DELAY_MS = 2100;
const IS_TEST_ENV = process.env.NODE_ENV === "test";

function normalizeMessageForDedup(message: string): string {
	return message.toLowerCase().replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function deterministicJitter(seed: string): number {
	let hash = 0;
	for (let index = 0; index < seed.length; index++) {
		hash = (hash * 31 + seed.charCodeAt(index)) | 0;
	}

	// Range: [-120, +120]
	return (Math.abs(hash) % 241) - 120;
}

function estimateAdaptiveDelayMs(input: {
	message: string;
	conversationId: string;
	triggerMessageId: string;
	messageNumber: number;
}): number {
	if (IS_TEST_ENV) {
		return 0;
	}

	const words = input.message.trim().split(/\s+/).filter(Boolean).length;
	const chars = input.message.length;
	const punctuationCost = Math.min(
		(input.message.match(/[.!?]/g)?.length ?? 0) * 90,
		270
	);
	const base = 360;
	const wordCost = words * 50;
	const charCost = Math.min(chars, 320) * 1.3;
	const jitter = deterministicJitter(
		`${input.conversationId}:${input.triggerMessageId}:${input.messageNumber}`
	);

	return clamp(
		Math.round(base + wordCost + charCost + punctuationCost + jitter),
		MIN_ADAPTIVE_DELAY_MS,
		MAX_ADAPTIVE_DELAY_MS
	);
}

async function sleep(ms: number): Promise<void> {
	if (ms <= 0) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeTypingCallback(
	callback: (() => Promise<void>) | undefined,
	params: {
		conversationId: string;
		callbackName: "startTyping" | "stopTyping";
	}
): Promise<void> {
	if (!callback) {
		return;
	}

	try {
		await callback();
	} catch (error) {
		console.warn(
			`[tool:sendMessage] conv=${params.conversationId} | Failed to ${params.callbackName}:`,
			error
		);
	}
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
	lastMessage: z
		.boolean()
		.optional()
		.default(true)
		.describe(
			"Whether this is the final public message in this run. Set false when you will send another public message next."
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
			"Send a public message visible to the visitor. Set lastMessage=false when another public message will follow in this run.",
		inputSchema,
		execute: ({ message, lastMessage }) =>
			runSequentially<
				ToolResult<{
					sent: boolean;
					messageId: string;
					duplicateSuppressed?: boolean;
					staleTriggerSuppressed?: boolean;
				}>
			>(async () => {
				let keepTypingAfterSend = false;
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

					if (messageNumber > 1) {
						const adaptiveDelayMs = estimateAdaptiveDelayMs({
							message,
							conversationId: ctx.conversationId,
							triggerMessageId: ctx.triggerMessageId,
							messageNumber,
						});
						console.log(
							`[tool:sendMessage] conv=${ctx.conversationId} | pacing delay=${adaptiveDelayMs}ms before send #${messageNumber}`
						);
						await invokeTypingCallback(ctx.startTyping, {
							conversationId: ctx.conversationId,
							callbackName: "startTyping",
						});
						await sleep(adaptiveDelayMs);
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

					keepTypingAfterSend = lastMessage === false;
					if (keepTypingAfterSend) {
						await invokeTypingCallback(ctx.startTyping, {
							conversationId: ctx.conversationId,
							callbackName: "startTyping",
						});
					}

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
					if (!keepTypingAfterSend) {
						await invokeTypingCallback(ctx.stopTyping, {
							conversationId: ctx.conversationId,
							callbackName: "stopTyping",
						});
					}
				}
			}),
	});
}
