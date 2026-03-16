import { describe, expect, it } from "bun:test";

const linkSourceQueriesModulePromise = import("./link-source");

describe("link source queries", () => {
	it("deleteLinkSource permanently deletes a matching row", async () => {
		let deleteCalls = 0;

		const { deleteLinkSource } = await linkSourceQueriesModulePromise;
		const result = await deleteLinkSource(
			{
				delete: () => {
					deleteCalls += 1;
					return {
						where: () => ({
							returning: async () => [{ id: "link-source-1" }],
						}),
					};
				},
			} as never,
			{
				id: "link-source-1",
				websiteId: "site-1",
			}
		);

		expect(result).toBe(true);
		expect(deleteCalls).toBe(1);
	});

	it("syncLinkSourceStatsFromKnowledge refreshes persisted page count and size", async () => {
		let updateSetArg: Record<string, unknown> | null = null;

		const updatedEntry = {
			id: "link-source-1",
			organizationId: "org-1",
			websiteId: "site-1",
			aiAgentId: null,
			parentLinkSourceId: null,
			url: "https://example.com",
			status: "completed" as const,
			firecrawlJobId: null,
			depth: 0,
			discoveredPagesCount: 3,
			crawledPagesCount: 3,
			totalSizeBytes: 1500,
			includePaths: null,
			excludePaths: null,
			ignoredUrls: null,
			lastCrawledAt: null,
			errorMessage: null,
			createdAt: "2026-03-16T00:00:00.000Z",
			updatedAt: "2026-03-16T01:00:00.000Z",
			deletedAt: null,
		};

		const { syncLinkSourceStatsFromKnowledge } =
			await linkSourceQueriesModulePromise;
		const result = await syncLinkSourceStatsFromKnowledge(
			{
				select: () => ({
					from: () => ({
						where: async () => [
							{
								crawledPagesCount: 3,
								totalSizeBytes: 1500,
							},
						],
					}),
				}),
				update: () => ({
					set: (arg: Record<string, unknown>) => {
						updateSetArg = arg;
						return {
							where: () => ({
								returning: async () => [updatedEntry],
							}),
						};
					},
				}),
			} as never,
			{
				id: "link-source-1",
				websiteId: "site-1",
			}
		);

		expect(result).toEqual(updatedEntry);
		expect(updateSetArg).toEqual(
			expect.objectContaining({
				crawledPagesCount: 3,
				totalSizeBytes: 1500,
			})
		);
	});
});
