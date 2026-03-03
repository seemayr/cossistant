import { and, asc, db, eq } from "@api/db";
import { checkUserWebsiteAccess } from "@api/db/queries/website";
import { conversation, conversationTimelineItem } from "@api/db/schema";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";

const CONVERSATION_ID_REGEX = /^CO[1-9A-HJ-NP-Z]{16}$/;
const NO_STORE_HEADERS = {
	"Cache-Control": "no-store",
};

type GetConversationDebugJsonResponseParams = {
	websiteSlug: string;
	conversationId: string;
};

export async function getConversationDebugJsonResponse({
	websiteSlug,
	conversationId,
}: GetConversationDebugJsonResponseParams) {
	const { user, session } = await getAuth();

	if (!(user && session)) {
		return NextResponse.json(
			{ error: "Unauthorized" },
			{ status: 401, headers: NO_STORE_HEADERS }
		);
	}

	if (!CONVERSATION_ID_REGEX.test(conversationId)) {
		return NextResponse.json(
			{ error: "Conversation not found" },
			{ status: 404, headers: NO_STORE_HEADERS }
		);
	}

	const accessCheck = await checkUserWebsiteAccess(db, {
		userId: user.id,
		websiteSlug,
	});

	if (!(accessCheck.hasAccess && accessCheck.website)) {
		return NextResponse.json(
			{ error: "Conversation not found" },
			{ status: 404, headers: NO_STORE_HEADERS }
		);
	}

	const [conversationRecord] = await db
		.select()
		.from(conversation)
		.where(
			and(
				eq(conversation.id, conversationId),
				eq(conversation.organizationId, accessCheck.website.organizationId),
				eq(conversation.websiteId, accessCheck.website.id)
			)
		)
		.limit(1);

	if (!conversationRecord) {
		return NextResponse.json(
			{ error: "Conversation not found" },
			{ status: 404, headers: NO_STORE_HEADERS }
		);
	}

	const timelineItems = await db
		.select()
		.from(conversationTimelineItem)
		.where(
			and(
				eq(
					conversationTimelineItem.organizationId,
					accessCheck.website.organizationId
				),
				eq(conversationTimelineItem.conversationId, conversationId)
			)
		)
		.orderBy(
			asc(conversationTimelineItem.createdAt),
			asc(conversationTimelineItem.id)
		);

	return NextResponse.json(
		{
			conversation: conversationRecord,
			timelineItems,
		},
		{ headers: NO_STORE_HEADERS }
	);
}
