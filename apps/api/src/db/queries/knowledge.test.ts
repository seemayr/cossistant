import { describe, expect, it } from "bun:test";

const knowledgeQueriesModulePromise = import("./knowledge");

describe("knowledge queries", () => {
	it("deleteKnowledge permanently deletes a matching row", async () => {
		let deleteCalls = 0;
		let whereCalls = 0;

		const { deleteKnowledge } = await knowledgeQueriesModulePromise;
		const result = await deleteKnowledge(
			{
				delete: () => {
					deleteCalls += 1;
					return {
						where: () => {
							whereCalls += 1;
							return {
								returning: async () => [{ id: "knowledge-1" }],
							};
						},
					};
				},
			} as never,
			{
				id: "knowledge-1",
				websiteId: "site-1",
			}
		);

		expect(result).toBe(true);
		expect(deleteCalls).toBe(1);
		expect(whereCalls).toBe(1);
	});

	it("deleteKnowledgeByLinkSource removes every row tied to the source", async () => {
		let deleteCalls = 0;

		const { deleteKnowledgeByLinkSource } = await knowledgeQueriesModulePromise;
		const deletedCount = await deleteKnowledgeByLinkSource(
			{
				delete: () => {
					deleteCalls += 1;
					return {
						where: () => ({
							returning: async () => [
								{ id: "knowledge-1" },
								{ id: "knowledge-2" },
							],
						}),
					};
				},
			} as never,
			{
				linkSourceId: "link-source-1",
				websiteId: "site-1",
			}
		);

		expect(deletedCount).toBe(2);
		expect(deleteCalls).toBe(1);
	});

	it("upsertKnowledge updates an active row without reviving deletedAt", async () => {
		const existing = {
			id: "knowledge-1",
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: null,
			linkSourceId: null,
			type: "faq" as const,
			sourceUrl: null,
			sourceTitle: "Old title",
			origin: "manual",
			createdBy: "user-1",
			contentHash: "old-hash",
			payload: { question: "Q", answer: "A" },
			metadata: null,
			isIncluded: true,
			sizeBytes: 32,
			createdAt: "2026-03-16T00:00:00.000Z",
			updatedAt: "2026-03-16T00:00:00.000Z",
			deletedAt: null,
		};
		const updated = {
			...existing,
			sourceTitle: "New title",
			contentHash: "new-hash",
			payload: { question: "Q", answer: "Updated A" },
			updatedAt: "2026-03-16T01:00:00.000Z",
		};

		let updateSetArg: Record<string, unknown> | null = null;

		const { upsertKnowledge } = await knowledgeQueriesModulePromise;
		const result = await upsertKnowledge(
			{
				select: () => ({
					from: () => ({
						where: () => ({
							limit: async () => [existing],
						}),
					}),
				}),
				update: () => ({
					set: (arg: Record<string, unknown>) => {
						updateSetArg = arg;
						return {
							where: () => ({
								returning: async () => [updated],
							}),
						};
					},
				}),
				insert: () => {
					throw new Error(
						"insert should not be called when the row already exists"
					);
				},
			} as never,
			{
				organizationId: "org-1",
				websiteId: "site-1",
				aiAgentId: null,
				type: "faq",
				sourceTitle: "New title",
				origin: "manual",
				createdBy: "user-1",
				payload: { question: "Q", answer: "Updated A" },
			}
		);

		expect(result).toEqual(updated);
		expect(updateSetArg).not.toBeNull();
		expect(updateSetArg).not.toHaveProperty("deletedAt");
	});
});
