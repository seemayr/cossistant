import { getConversationDebugJsonResponse } from "../_conversation-debug-json";

type ConversationJsonRouteProps = {
	params: Promise<{
		websiteSlug: string;
		conversationId: string;
	}>;
};

export async function GET(
	_request: Request,
	{ params }: ConversationJsonRouteProps
) {
	const { websiteSlug, conversationId } = await params;

	return getConversationDebugJsonResponse({
		websiteSlug,
		conversationId,
	});
}
