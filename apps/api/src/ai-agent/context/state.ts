/**
 * Conversation State
 *
 * Provides information about the current state of the conversation
 * including assignees, participants, and escalation status.
 */

import type { Database } from "@api/db";
import type { ConversationSelect } from "@api/db/schema/conversation";
import {
	conversationAssignee,
	conversationParticipant,
} from "@api/db/schema/conversation";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Current state of the conversation
 */
export type ConversationState = {
	hasHumanAssignee: boolean;
	assigneeIds: string[];
	participantIds: string[];
	isEscalated: boolean;
	escalationReason: string | null;
};

type GetStateParams = {
	conversationId: string;
	organizationId: string;
};

/**
 * Get the current state of a conversation
 */
export async function getConversationState(
	db: Database,
	params: GetStateParams,
	conversation: ConversationSelect
): Promise<ConversationState> {
	const [assignees, participants] = await Promise.all([
		db
			.select({ userId: conversationAssignee.userId })
			.from(conversationAssignee)
			.where(
				and(
					eq(conversationAssignee.conversationId, params.conversationId),
					eq(conversationAssignee.organizationId, params.organizationId),
					isNull(conversationAssignee.unassignedAt)
				)
			),
		db
			.select({ userId: conversationParticipant.userId })
			.from(conversationParticipant)
			.where(
				and(
					eq(conversationParticipant.conversationId, params.conversationId),
					eq(conversationParticipant.organizationId, params.organizationId),
					isNull(conversationParticipant.leftAt)
				)
			),
	]);

	const assigneeIds = assignees.map((a) => a.userId);
	const participantIds = participants.map((p) => p.userId);

	// Check escalation status: escalated if escalatedAt is set but not yet handled
	const isEscalated =
		!!conversation.escalatedAt && !conversation.escalationHandledAt;
	const escalationReason = conversation.escalationReason ?? null;

	return {
		hasHumanAssignee: assigneeIds.length > 0,
		assigneeIds,
		participantIds,
		isEscalated,
		escalationReason,
	};
}
