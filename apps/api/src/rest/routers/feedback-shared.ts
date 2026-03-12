import type { Database } from "@api/db";
import { createFeedback } from "@api/db/queries/feedback";
import { conversation } from "@api/db/schema/conversation";
import { trackConversationMetricForVisitor } from "@api/lib/tinybird-sdk";
import { eq } from "drizzle-orm";

type PersistFeedbackSubmissionParams = {
	db: Database;
	organizationId: string;
	websiteId: string;
	visitorId?: string;
	contactId?: string | null;
	conversationId?: string;
	rating: number;
	topic?: string;
	comment?: string;
	trigger?: string;
	source?: string;
	syncConversationRating?: boolean;
};

export async function persistFeedbackSubmission({
	db,
	organizationId,
	websiteId,
	visitorId,
	contactId,
	conversationId,
	rating,
	topic,
	comment,
	trigger,
	source = "widget",
	syncConversationRating = false,
}: PersistFeedbackSubmissionParams): Promise<{
	entry: Awaited<ReturnType<typeof createFeedback>>;
	ratedAt: string;
}> {
	const ratedAt = new Date().toISOString();

	if (syncConversationRating && conversationId) {
		await db
			.update(conversation)
			.set({
				visitorRating: rating,
				visitorRatingAt: ratedAt,
				updatedAt: ratedAt,
			})
			.where(eq(conversation.id, conversationId));
	}

	const entry = await createFeedback(db, {
		organizationId,
		websiteId,
		conversationId,
		visitorId,
		contactId: contactId ?? undefined,
		rating,
		topic,
		comment,
		trigger,
		source,
	});

	if (conversationId && visitorId) {
		void trackConversationMetricForVisitor(db, {
			website_id: websiteId,
			visitor_id: visitorId,
			conversation_id: conversationId,
			event_type: "feedback_submitted",
		});
	}

	return {
		entry,
		ratedAt,
	};
}
