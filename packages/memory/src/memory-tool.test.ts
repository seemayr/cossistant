import { describe, expect, it, mock } from "bun:test";
import type { ZodTypeAny } from "zod";
import type { Memory } from "./memory";
import { createMemoryTool } from "./memory-tool";
import type { MemoryItem } from "./types";

function createMemoryStub() {
	return {
		remember: mock(async () => ({
			id: "01JV0M2T2BEMM3J4Z6R2J7D1PH",
			createdAt: new Date("2026-03-22T10:00:00.000Z"),
		})),
		context: mock(async () => ({
			items: [
				{
					id: "01MEMORYITEM00000000000000",
					content: "User prefers monthly billing reminders",
					metadata: {
						organizationId: "org_1",
						websiteId: "site_1",
						aiAgentId: "agent_1",
						visitorId: "visitor_1",
					},
					priority: 2,
					createdAt: new Date("2026-03-20T10:00:00.000Z"),
					updatedAt: new Date("2026-03-20T10:00:00.000Z"),
					score: 0.91,
				} satisfies MemoryItem,
			],
			summary: "The visitor prefers proactive reminders for billing.",
		})),
	} as unknown as Pick<Memory, "remember" | "context"> & {
		remember: ReturnType<typeof mock>;
		context: ReturnType<typeof mock>;
	};
}

function asZodSchema(value: unknown): ZodTypeAny {
	return value as ZodTypeAny;
}

describe("createMemoryTool", () => {
	it("returns remember and recallMemory tools", () => {
		const memory = createMemoryStub();

		const tools = createMemoryTool({
			memory: memory as unknown as Memory,
			remember: {
				metadata: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
				},
			},
			recall: {
				where: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
				},
			},
		});

		expect(tools.remember).toBeDefined();
		expect(tools.recallMemory).toBeDefined();
	});

	it("rejects empty bound remember metadata", () => {
		const memory = createMemoryStub();

		expect(() =>
			createMemoryTool({
				memory: memory as unknown as Memory,
				remember: {
					metadata: {},
				},
				recall: {
					where: {
						visitorId: "visitor_1",
					},
				},
			})
		).toThrow(/remember\.metadata must not be empty/);
	});

	it("rejects invalid bound recall where", () => {
		const memory = createMemoryStub();

		expect(() =>
			createMemoryTool({
				memory: memory as unknown as Memory,
				remember: {
					metadata: {
						visitorId: "visitor_1",
					},
				},
				recall: {
					where: {} as never,
				},
			})
		).toThrow(/recall\.where must not be empty/);
	});

	it("remember schema accepts content and optional priority", () => {
		const memory = createMemoryStub();
		const { remember } = createMemoryTool({
			memory: memory as unknown as Memory,
			remember: {
				metadata: {
					visitorId: "visitor_1",
				},
			},
			recall: {
				where: {
					visitorId: "visitor_1",
				},
			},
		});

		const schema = asZodSchema(remember.inputSchema);
		const parsed = schema.safeParse({
			content: "Visitor asked for a PDF receipt next time",
			priority: 2,
		});

		expect(parsed.success).toBe(true);
	});

	it("remember schema rejects metadata-like extra fields", () => {
		const memory = createMemoryStub();
		const { remember } = createMemoryTool({
			memory: memory as unknown as Memory,
			remember: {
				metadata: {
					visitorId: "visitor_1",
				},
			},
			recall: {
				where: {
					visitorId: "visitor_1",
				},
			},
		});

		const schema = asZodSchema(remember.inputSchema);
		const parsed = schema.safeParse({
			content: "Persist this",
			metadata: {
				visitorId: "visitor_2",
			},
		});

		expect(parsed.success).toBe(false);
	});

	it("remember writes using the prebound metadata only", async () => {
		const memory = createMemoryStub();
		const { remember } = createMemoryTool({
			memory: memory as unknown as Memory,
			remember: {
				metadata: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
				},
			},
			recall: {
				where: {
					organizationId: "org_1",
					websiteId: "site_1",
					aiAgentId: "agent_1",
					visitorId: "visitor_1",
				},
			},
		});

		const result = await remember.execute?.(
			{
				content: "Visitor prefers monthly billing reminders",
				priority: 3,
			},
			{} as never
		);

		expect(memory.remember).toHaveBeenCalledWith({
			content: "Visitor prefers monthly billing reminders",
			priority: 3,
			metadata: {
				organizationId: "org_1",
				websiteId: "site_1",
				aiAgentId: "agent_1",
				visitorId: "visitor_1",
			},
		});
		expect(result).toEqual({
			success: true,
			changed: true,
			data: {
				id: "01JV0M2T2BEMM3J4Z6R2J7D1PH",
				createdAt: new Date("2026-03-22T10:00:00.000Z"),
			},
		});
	});

	it("recallMemory schema accepts text, limit, and includeSummary", () => {
		const memory = createMemoryStub();
		const { recallMemory } = createMemoryTool({
			memory: memory as unknown as Memory,
			remember: {
				metadata: {
					visitorId: "visitor_1",
				},
			},
			recall: {
				where: {
					visitorId: "visitor_1",
				},
			},
		});

		const schema = asZodSchema(recallMemory.inputSchema);
		const parsed = schema.safeParse({
			text: "billing reminders",
			limit: 5,
			includeSummary: true,
		});

		expect(parsed.success).toBe(true);
	});

	it("recallMemory schema rejects custom where input", () => {
		const memory = createMemoryStub();
		const { recallMemory } = createMemoryTool({
			memory: memory as unknown as Memory,
			remember: {
				metadata: {
					visitorId: "visitor_1",
				},
			},
			recall: {
				where: {
					visitorId: "visitor_1",
				},
			},
		});

		const schema = asZodSchema(recallMemory.inputSchema);
		const parsed = schema.safeParse({
			where: {
				visitorId: "visitor_2",
			},
		});

		expect(parsed.success).toBe(false);
	});

	it("recallMemory uses only the prebound recall scope and defaults", async () => {
		const memory = createMemoryStub();
		const { recallMemory } = createMemoryTool({
			memory: memory as unknown as Memory,
			remember: {
				metadata: {
					visitorId: "visitor_1",
				},
			},
			recall: {
				where: {
					and: [{ visitorId: "visitor_1" }, { websiteId: "site_1" }],
				},
				defaults: {
					limit: 6,
					includeSummary: true,
				},
			},
		});

		const result = await recallMemory.execute?.(
			{
				text: "billing reminders",
			},
			{} as never
		);

		expect(memory.context).toHaveBeenCalledWith({
			where: {
				and: [{ visitorId: "visitor_1" }, { websiteId: "site_1" }],
			},
			text: "billing reminders",
			limit: 6,
			includeSummary: true,
		});
		expect(result).toMatchObject({
			success: true,
			changed: false,
			data: {
				items: [
					{
						id: "01MEMORYITEM00000000000000",
					},
				],
				summary: "The visitor prefers proactive reminders for billing.",
			},
		});
	});

	it("returns a structured error result when tool execution fails", async () => {
		const memory = {
			remember: mock(async () => {
				throw new Error("Database unavailable");
			}),
			context: mock(async () => ({
				items: [],
			})),
		} as unknown as Memory;

		const { remember } = createMemoryTool({
			memory,
			remember: {
				metadata: {
					visitorId: "visitor_1",
				},
			},
			recall: {
				where: {
					visitorId: "visitor_1",
				},
			},
		});

		const result = await remember.execute?.(
			{
				content: "Store this",
			},
			{} as never
		);

		expect(result).toEqual({
			success: false,
			changed: false,
			error: "Database unavailable",
		});
	});
});
