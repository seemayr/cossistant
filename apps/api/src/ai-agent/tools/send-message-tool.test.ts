import { beforeEach, describe, expect, it, mock } from "bun:test";

const sendMessageActionMock = mock((async () => ({
	messageId: "msg-1",
	created: true,
	paused: false,
})) as (params: { idempotencyKey: string; createdAt?: Date }) => Promise<{
	messageId: string;
	created: boolean;
	paused: boolean;
}>);
const getLatestPublicVisitorMessageIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<string | null>
);

mock.module("../actions/send-message", () => ({
	sendMessage: sendMessageActionMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	getLatestPublicVisitorMessageId: getLatestPublicVisitorMessageIdMock,
}));

mock.module("ai", () => ({
	tool: (definition: unknown) => definition,
}));

const sendMessageToolModulePromise = import("./send-message-tool");

type TestToolContext = {
	allowPublicMessages: boolean;
	triggerMessageId: string;
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	aiAgentId: string;
	db: object;
	conversation: object;
	triggerSenderType?: "visitor" | "human_agent" | "ai_agent";
	triggerVisibility?: "public" | "private";
	counters: {
		sendMessage: number;
		sendPrivateMessage: number;
	};
	stopTyping?: () => Promise<void>;
	startTyping?: () => Promise<void>;
	onPublicMessageSent?: (params: {
		messageId: string;
		created: boolean;
	}) => void;
};

function createToolContext(
	overrides: Partial<TestToolContext> = {}
): TestToolContext {
	return {
		allowPublicMessages: true,
		triggerMessageId: "trigger-msg-1",
		conversationId: "conv-1",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		triggerSenderType: "visitor",
		triggerVisibility: "public",
		db: {},
		conversation: { id: "conv-1" },
		counters: {
			sendMessage: 0,
			sendPrivateMessage: 0,
		},
		...overrides,
	};
}

describe("createSendMessageTool", () => {
	beforeEach(() => {
		sendMessageActionMock.mockReset();
		getLatestPublicVisitorMessageIdMock.mockReset();
		sendMessageActionMock.mockResolvedValue({
			messageId: "msg-1",
			created: true,
			paused: false,
		});
		getLatestPublicVisitorMessageIdMock.mockResolvedValue("trigger-msg-1");
	});

	it("suppresses duplicate normalized text in the same run", async () => {
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const tool = createSendMessageTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { message: string }) => Promise<{
				success: boolean;
				data?: {
					sent: boolean;
					messageId: string;
					duplicateSuppressed?: boolean;
				};
			}>;
		};

		const first = await tool.execute({
			message: "Contact details confirmed",
		});
		const second = await tool.execute({
			message: "  contact   details   confirmed  ",
		});

		expect(first.success).toBe(true);
		expect(first.data?.sent).toBe(true);
		expect(second.success).toBe(true);
		expect(second.data?.sent).toBe(false);
		expect(second.data?.duplicateSuppressed).toBe(true);
		expect(sendMessageActionMock).toHaveBeenCalledTimes(1);
	});

	it("uses the same idempotency key for equivalent text across retries", async () => {
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const firstTool = createSendMessageTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { message: string }) => Promise<unknown>;
		};
		const secondTool = createSendMessageTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { message: string }) => Promise<unknown>;
		};

		await firstTool.execute({ message: "Thanks, Jack!" });
		await secondTool.execute({ message: "  THANKS,   jack! " });

		expect(sendMessageActionMock).toHaveBeenCalledTimes(2);
		const [firstArgs, secondArgs] = sendMessageActionMock.mock.calls;
		const firstCall = firstArgs?.[0] as {
			idempotencyKey: string;
		};
		const secondCall = secondArgs?.[0] as {
			idempotencyKey: string;
		};
		expect(firstCall).toBeDefined();
		expect(secondCall).toBeDefined();
		expect(firstCall.idempotencyKey).toBe(secondCall.idempotencyKey);
	});

	it("uses slot-based idempotency even if retry text differs", async () => {
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const firstTool = createSendMessageTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { message: string }) => Promise<unknown>;
		};
		const secondTool = createSendMessageTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { message: string }) => Promise<unknown>;
		};

		await firstTool.execute({ message: "Initial wording." });
		await secondTool.execute({ message: "Completely different wording." });

		const [firstArgs, secondArgs] = sendMessageActionMock.mock.calls;
		const firstCall = firstArgs?.[0] as {
			idempotencyKey: string;
		};
		const secondCall = secondArgs?.[0] as {
			idempotencyKey: string;
		};
		expect(firstCall.idempotencyKey).toBe(secondCall.idempotencyKey);
		expect(firstCall.idempotencyKey).toContain(":slot:1");
	});

	it("suppresses sends when a newer visitor message exists", async () => {
		getLatestPublicVisitorMessageIdMock.mockResolvedValue("visitor-msg-newer");
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const tool = createSendMessageTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { message: string }) => Promise<{
				success: boolean;
				data?: {
					sent: boolean;
					messageId: string;
					staleTriggerSuppressed?: boolean;
				};
			}>;
		};

		const result = await tool.execute({ message: "This should not send." });

		expect(result.success).toBe(true);
		expect(result.data?.sent).toBe(false);
		expect(result.data?.staleTriggerSuppressed).toBe(true);
		expect(sendMessageActionMock).toHaveBeenCalledTimes(0);
	});

	it("does not restart typing after sending a message", async () => {
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const stopTyping = mock(async () => {});
		const startTyping = mock(async () => {});
		const tool = createSendMessageTool(
			createToolContext({ stopTyping, startTyping }) as never
		) as unknown as {
			execute: (input: {
				message: string;
				lastMessage?: boolean;
			}) => Promise<{ success: boolean }>;
		};

		const result = await tool.execute({ message: "Single reply" });

		expect(result.success).toBe(true);
		expect(stopTyping).toHaveBeenCalledTimes(1);
		expect(startTyping).toHaveBeenCalledTimes(0);
	});

	it("keeps typing visible after non-final message chunks", async () => {
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const stopTyping = mock(async () => {});
		const startTyping = mock(async () => {});
		const tool = createSendMessageTool(
			createToolContext({ stopTyping, startTyping }) as never
		) as unknown as {
			execute: (input: {
				message: string;
				lastMessage?: boolean;
			}) => Promise<{ success: boolean }>;
		};

		const first = await tool.execute({
			message: "First chunk",
			lastMessage: false,
		});
		const second = await tool.execute({
			message: "Final chunk",
			lastMessage: true,
		});

		expect(first.success).toBe(true);
		expect(second.success).toBe(true);
		expect(startTyping).toHaveBeenCalledTimes(2);
		expect(stopTyping).toHaveBeenCalledTimes(1);
	});

	it("allows multiple distinct public messages in the same run", async () => {
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const tool = createSendMessageTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { message: string }) => Promise<{
				success: boolean;
				data?: {
					sent: boolean;
					messageId: string;
				};
			}>;
		};

		const first = await tool.execute({ message: "First message." });
		const second = await tool.execute({ message: "A second public message." });

		expect(first.success).toBe(true);
		expect(first.data?.sent).toBe(true);
		expect(second.success).toBe(true);
		expect(second.data?.sent).toBe(true);
		expect(sendMessageActionMock).toHaveBeenCalledTimes(2);

		const [firstArgs, secondArgs] = sendMessageActionMock.mock.calls;
		const firstCall = firstArgs?.[0] as { idempotencyKey: string };
		const secondCall = secondArgs?.[0] as { idempotencyKey: string };
		expect(firstCall.idempotencyKey).toContain(":slot:1");
		expect(secondCall.idempotencyKey).toContain(":slot:2");
	});

	it("restarts typing before a paced second message", async () => {
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const stopTyping = mock(async () => {});
		const startTyping = mock(async () => {});
		const tool = createSendMessageTool(
			createToolContext({ stopTyping, startTyping }) as never
		) as unknown as {
			execute: (input: {
				message: string;
				lastMessage?: boolean;
			}) => Promise<{ success: boolean }>;
		};

		const first = await tool.execute({ message: "First reply" });
		const second = await tool.execute({
			message: "Second reply with additional detail for pacing.",
		});

		expect(first.success).toBe(true);
		expect(second.success).toBe(true);
		expect(startTyping).toHaveBeenCalledTimes(1);
		expect(stopTyping).toHaveBeenCalledTimes(2);
	});

	it("stops typing on paused/error paths even when marked non-final", async () => {
		sendMessageActionMock.mockResolvedValueOnce({
			messageId: "msg-paused",
			created: false,
			paused: true,
		});
		sendMessageActionMock.mockRejectedValueOnce(new Error("network timeout"));
		const { createSendMessageTool } = await sendMessageToolModulePromise;
		const stopTyping = mock(async () => {});
		const startTyping = mock(async () => {});
		const tool = createSendMessageTool(
			createToolContext({ stopTyping, startTyping }) as never
		) as unknown as {
			execute: (input: {
				message: string;
				lastMessage?: boolean;
			}) => Promise<{ success: boolean }>;
		};

		const pausedResult = await tool.execute({
			message: "Paused path",
			lastMessage: false,
		});
		const errorResult = await tool.execute({
			message: "Error path",
			lastMessage: false,
		});

		expect(pausedResult.success).toBe(false);
		expect(errorResult.success).toBe(false);
		expect(stopTyping).toHaveBeenCalledTimes(2);
	});
});
