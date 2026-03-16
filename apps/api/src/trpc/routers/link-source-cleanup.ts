import type { Database } from "@api/db";
import { deleteKnowledge } from "@api/db/queries/knowledge";
import {
	syncLinkSourceStatsFromKnowledge,
	updateLinkSource,
} from "@api/db/queries/link-source";

type RemoveLinkSourceKnowledgePageDeps = {
	deleteKnowledge: typeof deleteKnowledge;
	syncLinkSourceStatsFromKnowledge: typeof syncLinkSourceStatsFromKnowledge;
	updateLinkSource: typeof updateLinkSource;
};

type RemoveLinkSourceKnowledgePageParams = {
	db: Database;
	websiteId: string;
	linkSourceId: string;
	knowledgeId: string;
	sourceUrl: string | null;
	ignoredUrls: string[] | null;
	ignoreFutureCrawls: boolean;
};

export function createRemoveLinkSourceKnowledgePage(
	deps: RemoveLinkSourceKnowledgePageDeps
) {
	return async function removeLinkSourceKnowledgePageHandler(
		params: RemoveLinkSourceKnowledgePageParams
	): Promise<boolean> {
		const {
			db,
			websiteId,
			linkSourceId,
			knowledgeId,
			sourceUrl,
			ignoredUrls,
			ignoreFutureCrawls,
		} = params;

		if (ignoreFutureCrawls && sourceUrl) {
			const currentIgnored = ignoredUrls ?? [];
			if (!currentIgnored.includes(sourceUrl)) {
				await deps.updateLinkSource(db, {
					id: linkSourceId,
					websiteId,
					ignoredUrls: [...currentIgnored, sourceUrl],
				});
			}
		}

		const deleted = await deps.deleteKnowledge(db, {
			id: knowledgeId,
			websiteId,
		});

		if (!deleted) {
			return false;
		}

		await deps.syncLinkSourceStatsFromKnowledge(db, {
			id: linkSourceId,
			websiteId,
		});

		return true;
	};
}

export const removeLinkSourceKnowledgePage =
	createRemoveLinkSourceKnowledgePage({
		deleteKnowledge,
		syncLinkSourceStatsFromKnowledge,
		updateLinkSource,
	});
