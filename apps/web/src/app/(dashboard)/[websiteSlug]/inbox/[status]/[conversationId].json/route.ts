import { getConversationDebugJsonResponse } from "../../_conversation-debug-json";

type ConversationWithStatusJsonRouteProps = {
	params: Promise<{
		websiteSlug: string;
		status: string;
		conversationId: string;
	}>;
};

export async function GET(
	_request: Request,
	{ params }: ConversationWithStatusJsonRouteProps
) {
	const { websiteSlug, conversationId } = await params;

	return getConversationDebugJsonResponse({
		websiteSlug,
		conversationId,
	});
}
