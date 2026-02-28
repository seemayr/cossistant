import { beforeEach, describe, expect, it, mock } from "bun:test";

const getCompleteVisitorWithContactMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const identifyContactMock = mock((async () => ({
	id: "contact-1",
	email: "jack@example.com",
	name: "Jack",
})) as (...args: unknown[]) => Promise<unknown>);
const linkVisitorToContactMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const updateContactMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const createConversationEventMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const realtimeEmitMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);

mock.module("@api/db/queries/visitor", () => ({
	getCompleteVisitorWithContact: getCompleteVisitorWithContactMock,
}));

mock.module("@api/db/queries/contact", () => ({
	identifyContact: identifyContactMock,
	linkVisitorToContact: linkVisitorToContactMock,
	updateContact: updateContactMock,
}));

mock.module("@api/utils/conversation-event", () => ({
	createConversationEvent: createConversationEventMock,
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("ai", () => ({
	tool: (definition: unknown) => definition,
}));

const identifyVisitorModulePromise = import("./identify-visitor");

type TestToolContext = {
	conversationId: string;
	organizationId: string;
	websiteId: string;
	visitorId: string;
	aiAgentId: string;
	db: object;
};

function createToolContext(
	overrides: Partial<TestToolContext> = {}
): TestToolContext {
	return {
		conversationId: "conv-1",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		aiAgentId: "ai-1",
		db: {},
		...overrides,
	};
}

describe("createIdentifyVisitorTool", () => {
	beforeEach(() => {
		getCompleteVisitorWithContactMock.mockReset();
		identifyContactMock.mockReset();
		linkVisitorToContactMock.mockReset();
		updateContactMock.mockReset();
		createConversationEventMock.mockReset();
		realtimeEmitMock.mockReset();

		identifyContactMock.mockResolvedValue({
			id: "contact-1",
			email: "jack@example.com",
			name: "Jack",
		});
		linkVisitorToContactMock.mockResolvedValue(undefined);
		updateContactMock.mockResolvedValue(null);
		createConversationEventMock.mockResolvedValue(undefined);
	});

	it("requires email for first-time identification", async () => {
		const { createIdentifyVisitorTool } = await identifyVisitorModulePromise;
		getCompleteVisitorWithContactMock.mockResolvedValue({
			id: "visitor-1",
			contact: null,
		});

		const tool = createIdentifyVisitorTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { email?: string; name?: string }) => Promise<{
				success: boolean;
				error?: string;
			}>;
		};

		const result = await tool.execute({ name: "Jack" });

		expect(result.success).toBe(false);
		expect(result.error).toContain("provide email");
		expect(identifyContactMock).toHaveBeenCalledTimes(0);
		expect(linkVisitorToContactMock).toHaveBeenCalledTimes(0);
	});

	it("allows email-only first-time identification", async () => {
		const { createIdentifyVisitorTool } = await identifyVisitorModulePromise;
		getCompleteVisitorWithContactMock
			.mockResolvedValueOnce({
				id: "visitor-1",
				contact: null,
			})
			.mockResolvedValueOnce({
				id: "visitor-1",
				websiteId: "site-1",
				organizationId: "org-1",
				contact: {
					id: "contact-1",
					name: null,
					email: "jack@example.com",
					image: null,
				},
			});

		const tool = createIdentifyVisitorTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { email?: string; name?: string }) => Promise<{
				success: boolean;
				data?: {
					visitorId: string;
					contactId: string;
					eventEmitted: boolean;
				};
			}>;
		};

		const result = await tool.execute({ email: "jack@example.com" });

		expect(result.success).toBe(true);
		expect(result.data?.eventEmitted).toBe(true);
		expect(identifyContactMock).toHaveBeenCalledTimes(1);
		const identifyArg = identifyContactMock.mock.calls[0]?.[1] as {
			email?: string;
			name?: string;
		};
		expect(identifyArg.email).toBe("jack@example.com");
		expect(identifyArg.name).toBeUndefined();
		expect(linkVisitorToContactMock).toHaveBeenCalledTimes(1);
	});

	it("returns cached result on second call in the same run", async () => {
		const { createIdentifyVisitorTool } = await identifyVisitorModulePromise;
		getCompleteVisitorWithContactMock
			.mockResolvedValueOnce({
				id: "visitor-1",
				contact: null,
			})
			.mockResolvedValueOnce({
				id: "visitor-1",
				websiteId: "site-1",
				organizationId: "org-1",
				contact: {
					id: "contact-1",
					name: "Jack",
					email: "jack@example.com",
					image: null,
				},
			});
		identifyContactMock.mockResolvedValue({
			id: "contact-1",
			email: "jack@example.com",
			name: "Jack",
		});

		const tool = createIdentifyVisitorTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { email?: string; name?: string }) => Promise<{
				success: boolean;
				data?: {
					visitorId: string;
					contactId: string;
					eventEmitted: boolean;
				};
			}>;
		};

		const first = await tool.execute({
			name: "Jack",
			email: "jack@example.com",
		});
		const second = await tool.execute({
			name: "Jack Updated",
			email: "updated@example.com",
		});

		expect(first.success).toBe(true);
		expect(second.success).toBe(true);
		expect(second.data).toEqual(first.data);
		expect(identifyContactMock).toHaveBeenCalledTimes(1);
		expect(linkVisitorToContactMock).toHaveBeenCalledTimes(1);
		expect(createConversationEventMock).toHaveBeenCalledTimes(1);
		expect(realtimeEmitMock).toHaveBeenCalledTimes(1);
	});

	it("emits the identification event once for first valid identification", async () => {
		const { createIdentifyVisitorTool } = await identifyVisitorModulePromise;
		getCompleteVisitorWithContactMock
			.mockResolvedValueOnce({
				id: "visitor-1",
				contact: null,
			})
			.mockResolvedValueOnce({
				id: "visitor-1",
				websiteId: "site-1",
				organizationId: "org-1",
				contact: {
					id: "contact-1",
					name: "Jack",
					email: "jack@example.com",
					image: null,
				},
			});

		const tool = createIdentifyVisitorTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { email?: string; name?: string }) => Promise<unknown>;
		};

		await tool.execute({
			name: "Jack",
			email: "jack@example.com",
		});
		await tool.execute({
			name: "Jack",
			email: "jack@example.com",
		});

		expect(createConversationEventMock).toHaveBeenCalledTimes(1);
		expect(realtimeEmitMock).toHaveBeenCalledTimes(1);
	});

	it("emits visitorIdentified sync even when contact fields are unchanged", async () => {
		const { createIdentifyVisitorTool } = await identifyVisitorModulePromise;
		getCompleteVisitorWithContactMock
			.mockResolvedValueOnce({
				id: "visitor-1",
				websiteId: "site-1",
				organizationId: "org-1",
				contact: {
					id: "contact-1",
					name: "Jack",
					email: "jack@example.com",
					image: null,
				},
			})
			.mockResolvedValueOnce({
				id: "visitor-1",
				websiteId: "site-1",
				organizationId: "org-1",
				contact: {
					id: "contact-1",
					name: "Jack",
					email: "jack@example.com",
					image: null,
				},
			});

		const tool = createIdentifyVisitorTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { email?: string; name?: string }) => Promise<{
				success: boolean;
				data?: {
					eventEmitted: boolean;
				};
			}>;
		};

		const result = await tool.execute({
			name: "Jack",
			email: "jack@example.com",
		});

		expect(result.success).toBe(true);
		expect(result.data?.eventEmitted).toBe(false);
		expect(updateContactMock).toHaveBeenCalledTimes(0);
		expect(createConversationEventMock).toHaveBeenCalledTimes(0);
		expect(realtimeEmitMock).toHaveBeenCalledTimes(1);
		expect(realtimeEmitMock.mock.calls[0]?.[0]).toBe("visitorIdentified");
		expect(realtimeEmitMock.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				userId: null,
			})
		);
	});

	it("skips visitorIdentified sync emit when refreshed visitor cannot be loaded", async () => {
		const { createIdentifyVisitorTool } = await identifyVisitorModulePromise;
		getCompleteVisitorWithContactMock
			.mockResolvedValueOnce({
				id: "visitor-1",
				contact: null,
			})
			.mockResolvedValueOnce(null);

		const tool = createIdentifyVisitorTool(
			createToolContext() as never
		) as unknown as {
			execute: (input: { email?: string; name?: string }) => Promise<{
				success: boolean;
			}>;
		};

		const result = await tool.execute({
			name: "Jack",
			email: "jack@example.com",
		});

		expect(result.success).toBe(true);
		expect(createConversationEventMock).toHaveBeenCalledTimes(1);
		expect(realtimeEmitMock).toHaveBeenCalledTimes(0);
	});
});
