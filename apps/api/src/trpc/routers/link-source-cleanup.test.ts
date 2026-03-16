import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createRemoveLinkSourceKnowledgePage } from "./link-source-cleanup";

const deleteKnowledgeMock = mock(async () => true);
const syncLinkSourceStatsFromKnowledgeMock = mock(async () => null);
const updateLinkSourceMock = mock(async () => null);

const removeLinkSourceKnowledgePage = createRemoveLinkSourceKnowledgePage({
	deleteKnowledge: deleteKnowledgeMock as never,
	syncLinkSourceStatsFromKnowledge:
		syncLinkSourceStatsFromKnowledgeMock as never,
	updateLinkSource: updateLinkSourceMock as never,
});

describe("removeLinkSourceKnowledgePage", () => {
	beforeEach(() => {
		deleteKnowledgeMock.mockReset();
		deleteKnowledgeMock.mockResolvedValue(true);
		syncLinkSourceStatsFromKnowledgeMock.mockReset();
		syncLinkSourceStatsFromKnowledgeMock.mockResolvedValue(null);
		updateLinkSourceMock.mockReset();
		updateLinkSourceMock.mockResolvedValue(null);
	});

	it("appends ignored URLs before deleting and syncing page stats", async () => {
		const result = await removeLinkSourceKnowledgePage({
			db: {} as never,
			websiteId: "site-1",
			linkSourceId: "link-source-1",
			knowledgeId: "knowledge-1",
			sourceUrl: "https://example.com/docs",
			ignoredUrls: ["https://example.com/old"],
			ignoreFutureCrawls: true,
		});

		expect(result).toBe(true);
		expect(updateLinkSourceMock).toHaveBeenCalledWith(expect.anything(), {
			id: "link-source-1",
			websiteId: "site-1",
			ignoredUrls: ["https://example.com/old", "https://example.com/docs"],
		});
		expect(deleteKnowledgeMock).toHaveBeenCalledWith(expect.anything(), {
			id: "knowledge-1",
			websiteId: "site-1",
		});
		expect(syncLinkSourceStatsFromKnowledgeMock).toHaveBeenCalledWith(
			expect.anything(),
			{
				id: "link-source-1",
				websiteId: "site-1",
			}
		);
	});

	it("skips ignored-url updates for plain page deletes", async () => {
		const result = await removeLinkSourceKnowledgePage({
			db: {} as never,
			websiteId: "site-1",
			linkSourceId: "link-source-1",
			knowledgeId: "knowledge-1",
			sourceUrl: "https://example.com/docs",
			ignoredUrls: null,
			ignoreFutureCrawls: false,
		});

		expect(result).toBe(true);
		expect(updateLinkSourceMock).not.toHaveBeenCalled();
		expect(deleteKnowledgeMock).toHaveBeenCalledTimes(1);
		expect(syncLinkSourceStatsFromKnowledgeMock).toHaveBeenCalledTimes(1);
	});

	it("does not sync stats when the knowledge row was already missing", async () => {
		deleteKnowledgeMock.mockResolvedValueOnce(false);

		const result = await removeLinkSourceKnowledgePage({
			db: {} as never,
			websiteId: "site-1",
			linkSourceId: "link-source-1",
			knowledgeId: "knowledge-1",
			sourceUrl: "https://example.com/docs",
			ignoredUrls: null,
			ignoreFutureCrawls: false,
		});

		expect(result).toBe(false);
		expect(syncLinkSourceStatsFromKnowledgeMock).not.toHaveBeenCalled();
	});
});
