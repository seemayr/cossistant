import type { Database } from "@api/db";
import {
	getConversationById,
	getMessageMetadata,
} from "@api/db/queries/conversation";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import type { ConversationSelect } from "@api/db/schema/conversation";
import {
	conversationAssignee,
	conversationParticipant,
} from "@api/db/schema/conversation";
import { website } from "@api/db/schema/website";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { isAutomaticTranslationEnabled } from "@api/lib/translation";
import { and, eq, isNull } from "drizzle-orm";
import type {
	ConversationState,
	ConversationTranscriptEntry,
	RoleAwareMessage,
	SegmentedConversationEntry,
	SegmentedConversationMessage,
	VisitorContext,
} from "../../contracts";
import { buildTriggerCenteredTimelineContext } from "./history";
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
	websiteDefaultLanguage: string;
	visitorLanguage: string | null;
	autoTranslateEnabled: boolean;
	conversationHistory: ConversationTranscriptEntry[];
	decisionMessages: SegmentedConversationMessage[];
	generationEntries: SegmentedConversationEntry[];
	visitorContext: VisitorContext | null;
	conversationState: ConversationState;
	triggerMessage: RoleAwareMessage | null;
	triggerMessageText: string | null;
	hasLaterHumanMessage: boolean;
	hasLaterAiMessage: boolean;
}> {
	const [timelineContext, visitorContext, conversationState, websiteRecord] =
		await Promise.all([
			buildTriggerCenteredTimelineContext(db, {
				conversationId: params.conversationId,
				organizationId: params.organizationId,
				websiteId: params.websiteId,
				triggerMessageId: params.triggerMetadata.id,
				triggerMessageCreatedAt: params.triggerMetadata.createdAt,
			}),
			loadVisitorContext(db, {
				visitorId: params.visitorId,
			}),
			loadConversationState(db, {
				conversationId: params.conversationId,
				organizationId: params.organizationId,
				conversation: params.conversation,
			}),
			db.query.website.findFirst({
				where: eq(website.id, params.websiteId),
			}),
		]);

	const autoTranslateEnabled = websiteRecord
		? isAutomaticTranslationEnabled({
				planAllowsAutoTranslate:
					(await getPlanForWebsite(websiteRecord)).features[
						"auto-translate"
					] === true,
				websiteAutoTranslateEnabled: websiteRecord.autoTranslateEnabled,
			})
		: false;

	return {
		websiteDefaultLanguage: websiteRecord?.defaultLanguage ?? "en",
		visitorLanguage: params.conversation.visitorLanguage ?? null,
		autoTranslateEnabled,
		conversationHistory: timelineContext.conversationHistory,
		decisionMessages: timelineContext.decisionMessages,
		generationEntries: timelineContext.generationEntries,
		visitorContext,
		conversationState,
		triggerMessage: timelineContext.triggerMessage,
		triggerMessageText:
			timelineContext.triggerMessage?.content ??
			params.triggerMetadata.text ??
			null,
		hasLaterHumanMessage: timelineContext.hasLaterHumanMessage,
		hasLaterAiMessage: timelineContext.hasLaterAiMessage,
	};
}
