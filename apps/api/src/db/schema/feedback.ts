import {
	type InferInsertModel,
	type InferSelectModel,
	relations,
} from "drizzle-orm";
import { index, integer, pgTable, text, varchar } from "drizzle-orm/pg-core";
import {
	ulidNullableReference,
	ulidPrimaryKey,
	ulidReference,
} from "../../utils/db/ids";
import { isoTimestamp as timestamp } from "../../utils/db/timestamp";
import { organization } from "./auth";
import { conversation } from "./conversation";
import { contact, visitor, website } from "./website";

/**
 * Feedback table for collecting ratings and comments from visitors.
 *
 * Can be:
 * - Tied to a conversation (post-support feedback)
 * - Standalone (product feedback, churn feedback, NPS surveys)
 *
 * The `trigger` field categorizes what prompted the feedback:
 * - "conversation_resolved" - After support conversation
 * - "churn" - User cancelling subscription
 * - "upgrade" / "downgrade" - Plan changes
 * - "nps_survey" - NPS campaign
 * - Custom triggers defined by customers
 */
export const feedback = pgTable(
	"feedback",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		websiteId: ulidReference("website_id").references(() => website.id, {
			onDelete: "cascade",
		}),
		// Optional - feedback can be standalone or tied to a conversation
		conversationId: varchar("conversation_id", { length: 18 }).references(
			() => conversation.id,
			{ onDelete: "set null" }
		),
		// Who submitted the feedback
		visitorId: ulidNullableReference("visitor_id").references(
			() => visitor.id,
			{ onDelete: "set null" }
		),
		contactId: ulidNullableReference("contact_id").references(
			() => contact.id,
			{ onDelete: "set null" }
		),
		// Feedback data
		rating: integer("rating").notNull(), // 1-5 scale
		topic: text("topic"), // Optional structured topic selected by the visitor
		comment: text("comment"), // Optional written feedback
		trigger: text("trigger"), // What triggered this feedback (e.g., "churn", "conversation_resolved")
		source: text("source").notNull().default("widget"), // Where feedback was collected
		// Timestamps
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		// Analytics index - for querying feedback by date range
		index("feedback_org_website_created_idx").on(
			table.organizationId,
			table.websiteId,
			table.createdAt,
			table.deletedAt
		),
		// Index for filtering by trigger (e.g., all "churn" feedback)
		index("feedback_org_website_trigger_idx").on(
			table.organizationId,
			table.websiteId,
			table.trigger,
			table.deletedAt
		),
		// Lookup indexes
		index("feedback_website_idx").on(table.websiteId),
		index("feedback_conversation_idx").on(table.conversationId),
		index("feedback_visitor_idx").on(table.visitorId),
		index("feedback_contact_idx").on(table.contactId),
		// Soft delete index
		index("feedback_deleted_at_idx").on(table.deletedAt),
	]
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
	organization: one(organization, {
		fields: [feedback.organizationId],
		references: [organization.id],
	}),
	website: one(website, {
		fields: [feedback.websiteId],
		references: [website.id],
	}),
	conversation: one(conversation, {
		fields: [feedback.conversationId],
		references: [conversation.id],
	}),
	visitor: one(visitor, {
		fields: [feedback.visitorId],
		references: [visitor.id],
	}),
	contact: one(contact, {
		fields: [feedback.contactId],
		references: [contact.id],
	}),
}));

export type FeedbackSelect = InferSelectModel<typeof feedback>;
export type FeedbackInsert = InferInsertModel<typeof feedback>;
