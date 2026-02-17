import type { Database } from "@api/db";
import {
	contact,
	conversation,
	conversationTimelineItem,
	member,
	teamMember,
} from "@api/db/schema";
import { ConversationTimelineType } from "@cossistant/types";
import { and, count, eq, isNull } from "drizzle-orm";

/**
 * Get the count of messages for a website
 * Messages are stored in conversationTimelineItem where type = 'MESSAGE'
 * Note: conversationTimelineItem doesn't have websiteId directly, so we join with conversation
 */
export async function getMessageCount(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(conversationTimelineItem)
		.innerJoin(
			conversation,
			eq(conversation.id, conversationTimelineItem.conversationId)
		)
		.where(
			and(
				eq(conversation.websiteId, params.websiteId),
				eq(conversationTimelineItem.organizationId, params.organizationId),
				eq(conversationTimelineItem.type, ConversationTimelineType.MESSAGE),
				isNull(conversationTimelineItem.deletedAt),
				isNull(conversation.deletedAt)
			)
		);

	return result[0]?.count ?? 0;
}

/**
 * Get the count of contacts for a website
 */
export async function getContactCount(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(contact)
		.where(
			and(
				eq(contact.websiteId, params.websiteId),
				eq(contact.organizationId, params.organizationId),
				isNull(contact.deletedAt)
			)
		);

	return result[0]?.count ?? 0;
}

/**
 * Get the count of conversations for a website
 */
export async function getConversationCount(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
	}
): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(conversation)
		.where(
			and(
				eq(conversation.websiteId, params.websiteId),
				eq(conversation.organizationId, params.organizationId),
				isNull(conversation.deletedAt)
			)
		);

	return result[0]?.count ?? 0;
}

/**
 * Get the count of team members for a website
 * Counts team members of the website's team
 */
export async function getTeamMemberCount(
	db: Database,
	params: {
		teamId: string;
		organizationId: string;
	}
): Promise<number> {
	const [teamUsers, organizationMembers] = await Promise.all([
		db
			.select({
				userId: teamMember.userId,
			})
			.from(teamMember)
			.where(eq(teamMember.teamId, params.teamId)),
		db
			.select({
				userId: member.userId,
				role: member.role,
			})
			.from(member)
			.where(eq(member.organizationId, params.organizationId)),
	]);

	const ids = new Set(teamUsers.map((row) => row.userId));

	for (const organizationMember of organizationMembers) {
		const roles = organizationMember.role
			.split(",")
			.map((role) => role.trim().toLowerCase());
		if (roles.includes("owner") || roles.includes("admin")) {
			ids.add(organizationMember.userId);
		}
	}

	return ids.size;
}

/**
 * Get all usage counts for a website in a single call
 */
export async function getWebsiteUsageCounts(
	db: Database,
	params: {
		websiteId: string;
		organizationId: string;
		teamId: string;
	}
): Promise<{
	messages: number;
	contacts: number;
	conversations: number;
	teamMembers: number;
}> {
	const [messages, contacts, conversations, teamMembers] = await Promise.all([
		getMessageCount(db, params),
		getContactCount(db, params),
		getConversationCount(db, params),
		getTeamMemberCount(db, {
			teamId: params.teamId,
			organizationId: params.organizationId,
		}),
	]);

	return {
		messages,
		contacts,
		conversations,
		teamMembers,
	};
}
