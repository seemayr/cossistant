import type { QueryClient } from "@tanstack/react-query";

type ActiveClarificationQueryInput = {
	websiteSlug?: string;
	conversationId?: string;
};

type QueryKeyInput = {
	input?: ActiveClarificationQueryInput;
	type?: string;
};

function extractActiveClarificationInput(
	queryKey: readonly unknown[]
): ActiveClarificationQueryInput | null {
	if (queryKey.length < 2) {
		return null;
	}

	const maybeInput = queryKey[1];
	if (!maybeInput || typeof maybeInput !== "object") {
		return null;
	}

	const input = (maybeInput as QueryKeyInput).input;
	if (!input || typeof input !== "object") {
		return null;
	}

	return input;
}

export function forEachActiveConversationClarificationQuery(
	queryClient: QueryClient,
	params: {
		websiteSlug: string;
		conversationId: string;
		callback: (queryKey: readonly unknown[]) => void;
	}
): void {
	const queries = queryClient.getQueryCache().findAll({
		queryKey: [["knowledgeClarification", "getActiveForConversation"]],
	});

	for (const query of queries) {
		const queryKey = query.queryKey as readonly unknown[];
		const input = extractActiveClarificationInput(queryKey);

		if (!input) {
			continue;
		}

		if (input.websiteSlug !== params.websiteSlug) {
			continue;
		}

		if (input.conversationId !== params.conversationId) {
			continue;
		}

		params.callback(queryKey);
	}
}

export function invalidateActiveConversationClarificationQuery(
	queryClient: QueryClient,
	params: {
		websiteSlug: string;
		conversationId: string;
	}
): void {
	forEachActiveConversationClarificationQuery(queryClient, {
		...params,
		callback: (queryKey) => {
			void queryClient.invalidateQueries({
				queryKey,
				exact: true,
			});
		},
	});
}
