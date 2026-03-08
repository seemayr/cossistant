import type { Database } from "@api/db";
import {
	getConversationById,
	getMessageMetadata,
	getPublicAiMessagesAfterCursor,
} from "@api/db/queries/conversation";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import type { ConversationSelect } from "@api/db/schema/conversation";
import {
	conversationAssignee,
	conversationParticipant,
} from "@api/db/schema/conversation";
import { and, eq, isNull } from "drizzle-orm";
import type {
	ContinuationContext,
	ConversationState,
	RoleAwareMessage,
	VisitorContext,
} from "../../contracts";
import { buildRoleAwareConversationHistory } from "./history";
import type { TriggerMessageMetadata } from "./types";

type LoadConversationSeedInput = {
	conversationId: string;
	messageId: string;
	organizationId: string;
};

export async function loadConversationSeed(
	db: Database,
	input: LoadConversationSeedInput
): Promise<{
	conversation: ConversationSelect | null;
	triggerMetadata: TriggerMessageMetadata | null;
}> {
	const [conversation, triggerMetadata] = await Promise.all([
		getConversationById(db, {
			conversationId: input.conversationId,
		}),
		getMessageMetadata(db, {
			messageId: input.messageId,
			organizationId: input.organizationId,
		}),
	]);

	if (!triggerMetadata) {
		return {
			conversation,
			triggerMetadata: null,
		};
	}

	return {
		conversation,
		triggerMetadata: {
			id: triggerMetadata.id,
			createdAt: triggerMetadata.createdAt,
			conversationId: triggerMetadata.conversationId,
			text: triggerMetadata.text ?? null,
		},
	};
}

async function loadVisitorContext(
	db: Database,
	params: {
		visitorId: string;
	}
): Promise<VisitorContext | null> {
	const visitorWithContact = await getCompleteVisitorWithContact(db, {
		visitorId: params.visitorId,
	});

	if (!visitorWithContact) {
		return null;
	}

	return {
		name:
			visitorWithContact.contact?.name ??
			visitorWithContact.contact?.email?.split("@")[0] ??
			null,
		email: visitorWithContact.contact?.email ?? null,
		isIdentified: Boolean(visitorWithContact.contact),
		country: visitorWithContact.country ?? null,
		city: visitorWithContact.city ?? null,
		language: visitorWithContact.language ?? null,
		timezone: visitorWithContact.timezone ?? null,
		browser: visitorWithContact.browser ?? null,
		device: visitorWithContact.device ?? null,
		metadata:
			(visitorWithContact.contact?.metadata as Record<string, unknown>) ?? null,
	};
}

async function loadConversationState(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		conversation: ConversationSelect;
	}
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

	const assigneeIds = assignees.map((row) => row.userId);
	const participantIds = participants.map((row) => row.userId);

	return {
		hasHumanAssignee: assigneeIds.length > 0,
		assigneeIds,
		participantIds,
		isEscalated:
			Boolean(params.conversation.escalatedAt) &&
			!params.conversation.escalationHandledAt,
		escalationReason: params.conversation.escalationReason ?? null,
	};
}

async function loadContinuationContext(
	db: Database,
	params: {
		conversation: ConversationSelect;
	}
): Promise<ContinuationContext | null> {
	const previousProcessedMessageCreatedAt =
		params.conversation.aiAgentLastProcessedMessageCreatedAt;
	const previousProcessedMessageId =
		params.conversation.aiAgentLastProcessedMessageId;

	if (!(previousProcessedMessageCreatedAt && previousProcessedMessageId)) {
		return null;
	}

	const aiReplies = await getPublicAiMessagesAfterCursor(db, {
		conversationId: params.conversation.id,
		organizationId: params.conversation.organizationId,
		afterCreatedAt: previousProcessedMessageCreatedAt,
		afterId: previousProcessedMessageId,
		limit: 10,
	});

	const latestAiReply = aiReplies
		.map((message) => message.text?.trim() ?? "")
		.filter((text) => text.length > 0)
		.join("\n\n");

	if (!latestAiReply) {
		return null;
	}

	return {
		previousProcessedMessageId,
		previousProcessedMessageCreatedAt,
		latestAiReply,
	};
}

export async function loadIntakeContext(
	db: Database,
	params: {
		conversationId: string;
		organizationId: string;
		websiteId: string;
		visitorId: string;
		conversation: ConversationSelect;
		triggerMetadata: TriggerMessageMetadata;
	}
): Promise<{
	conversationHistory: RoleAwareMessage[];
	visitorContext: VisitorContext | null;
	conversationState: ConversationState;
	triggerMessage: RoleAwareMessage | null;
	triggerMessageText: string | null;
	continuationContext: ContinuationContext | null;
}> {
	const [
		conversationHistory,
		visitorContext,
		conversationState,
		continuationContext,
	] = await Promise.all([
		buildRoleAwareConversationHistory(db, {
			conversationId: params.conversationId,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			maxCreatedAt: params.triggerMetadata.createdAt,
			maxId: params.triggerMetadata.id,
		}),
		loadVisitorContext(db, {
			visitorId: params.visitorId,
		}),
		loadConversationState(db, {
			conversationId: params.conversationId,
			organizationId: params.organizationId,
			conversation: params.conversation,
		}),
		loadContinuationContext(db, {
			conversation: params.conversation,
		}),
	]);

	const triggerMessage =
		conversationHistory.find(
			(message) => message.messageId === params.triggerMetadata.id
		) ?? null;

	return {
		conversationHistory,
		visitorContext,
		conversationState,
		triggerMessage,
		triggerMessageText: params.triggerMetadata.text ?? null,
		continuationContext,
	};
}
