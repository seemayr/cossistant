import type { Database } from "@api/db";
import { getAiAgentForWebsite } from "@api/db/queries/ai-agent";
import { getConversationTimelineItems } from "@api/db/queries/conversation";
import { getWebsiteMembers } from "@api/db/queries/member";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import { getVisitorNameWithFallback } from "@cossistant/core";
import {
	ConversationEventType,
	type ConversationExport,
	TimelineItemVisibility,
} from "@cossistant/types";
import type {
	FilePart,
	ImagePart,
	TimelineItem,
	TimelinePartEvent,
} from "@cossistant/types/api/timeline-item";

const EXPORT_PAGE_SIZE = 200;
const EXPORT_MIME_TYPE = "text/plain; charset=utf-8" as const;
const MAX_EXPORT_PAGES = 1000;

type ExportWebsite = {
	id: string;
	slug: string;
	organizationId: string;
	teamId?: string | null;
};

type ExportConversation = {
	id: string;
	title?: string | null;
	createdAt: string;
	visitorId?: string | null;
};

type ExportContext = {
	db: Database;
	website: ExportWebsite;
	conversation: ExportConversation;
};

type ExportIdentityContext = {
	visitorDisplayName: string;
	visitorSummary: string;
	memberNameById: Map<string, string>;
	aiAgentNameById: Map<string, string>;
};

function isEventPart(part: unknown): part is TimelinePartEvent {
	return (
		typeof part === "object" &&
		part !== null &&
		"type" in part &&
		part.type === "event" &&
		"eventType" in part &&
		typeof part.eventType === "string"
	);
}

function isImagePart(part: unknown): part is ImagePart {
	return (
		typeof part === "object" &&
		part !== null &&
		"type" in part &&
		part.type === "image" &&
		"url" in part &&
		typeof part.url === "string"
	);
}

function isFilePart(part: unknown): part is FilePart {
	return (
		typeof part === "object" &&
		part !== null &&
		"type" in part &&
		part.type === "file" &&
		"url" in part &&
		typeof part.url === "string"
	);
}

function resolveTeamMemberName(
	memberNameById: Map<string, string>,
	userId: string | null | undefined
): string {
	if (!userId) {
		return "Team member";
	}

	return memberNameById.get(userId) ?? `Team member (${userId})`;
}

function resolveAiAgentName(
	aiAgentNameById: Map<string, string>,
	aiAgentId: string | null | undefined
): string {
	if (!aiAgentId) {
		return "AI agent";
	}

	return aiAgentNameById.get(aiAgentId) ?? `AI agent (${aiAgentId})`;
}

function buildActorSentence(params: {
	event: TimelinePartEvent;
	identities: ExportIdentityContext;
}): string {
	const { event, identities } = params;

	if (event.eventType === ConversationEventType.VISITOR_IDENTIFIED) {
		return `${identities.visitorDisplayName} identified, new contact created`;
	}

	if (event.actorAiAgentId) {
		return resolveAiAgentName(identities.aiAgentNameById, event.actorAiAgentId);
	}

	return resolveTeamMemberName(identities.memberNameById, event.actorUserId);
}

function buildFallbackEventText(params: {
	event: TimelinePartEvent;
	identities: ExportIdentityContext;
}): string {
	const actor = buildActorSentence(params);
	const { event } = params;

	switch (event.eventType) {
		case ConversationEventType.ASSIGNED:
			return `${actor} assigned the conversation`;
		case ConversationEventType.UNASSIGNED:
			return `${actor} unassigned the conversation`;
		case ConversationEventType.PARTICIPANT_REQUESTED:
			return `${actor} requested a team member to join`;
		case ConversationEventType.PARTICIPANT_JOINED:
			return `${actor} joined the conversation`;
		case ConversationEventType.PARTICIPANT_LEFT:
			return `${actor} left the conversation`;
		case ConversationEventType.STATUS_CHANGED:
			return `${actor} changed the status`;
		case ConversationEventType.PRIORITY_CHANGED:
			return `${actor} changed the priority`;
		case ConversationEventType.TAG_ADDED:
			return `${actor} added a tag`;
		case ConversationEventType.TAG_REMOVED:
			return `${actor} removed a tag`;
		case ConversationEventType.RESOLVED:
			return `${actor} resolved the conversation`;
		case ConversationEventType.REOPENED:
			return `${actor} reopened the conversation`;
		case ConversationEventType.VISITOR_BLOCKED:
			return `${actor} blocked the visitor`;
		case ConversationEventType.VISITOR_UNBLOCKED:
			return `${actor} unblocked the visitor`;
		case ConversationEventType.VISITOR_IDENTIFIED:
			return `${params.identities.visitorDisplayName} identified, new contact created`;
		case ConversationEventType.AI_PAUSED:
			return `${actor} paused AI answers`;
		case ConversationEventType.AI_RESUMED:
			return `${actor} resumed AI answers`;
		default:
			return `${actor} performed an action`;
	}
}

function buildMessageActorLabel(params: {
	item: TimelineItem;
	identities: ExportIdentityContext;
}): string {
	const { item, identities } = params;

	if (item.visitorId) {
		return `Visitor: ${identities.visitorDisplayName}`;
	}

	if (item.aiAgentId) {
		return `AI: ${resolveAiAgentName(
			identities.aiAgentNameById,
			item.aiAgentId
		)}`;
	}

	if (item.userId) {
		return `Team: ${resolveTeamMemberName(
			identities.memberNameById,
			item.userId
		)}`;
	}

	return "System";
}

function buildVisibilityLabel(visibility: TimelineItem["visibility"]): string {
	return visibility === TimelineItemVisibility.PRIVATE ? "private" : "public";
}

function formatAttachmentLine(part: FilePart | ImagePart): string {
	const label = part.type === "image" ? "Image" : "File";
	const segments = [label];

	if (part.filename) {
		segments.push(part.filename);
	}

	if (part.mediaType) {
		segments.push(`(${part.mediaType})`);
	}

	segments.push(part.url);

	return `- ${segments.join(" ")}`;
}

function formatMessageBlock(params: {
	item: TimelineItem;
	identities: ExportIdentityContext;
}): string {
	const { item, identities } = params;
	const lines = [
		`[${item.createdAt}] ${buildMessageActorLabel({ item, identities })} [${buildVisibilityLabel(item.visibility)}]`,
	];

	if (item.text?.trim()) {
		lines.push(item.text.trim());
	}

	const attachments = item.parts.filter(
		(part): part is FilePart | ImagePart =>
			isFilePart(part) || isImagePart(part)
	);

	if (attachments.length > 0) {
		if (item.text?.trim()) {
			lines.push("");
		}

		lines.push("Attachments:");
		lines.push(...attachments.map(formatAttachmentLine));
	}

	if (!item.text?.trim() && attachments.length === 0) {
		lines.push("(empty message)");
	}

	return lines.join("\n");
}

function formatEventBlock(params: {
	item: TimelineItem;
	identities: ExportIdentityContext;
}): string {
	const { item, identities } = params;
	const eventPart = item.parts.find(isEventPart);
	const trimmedEventMessage = eventPart?.message?.trim();
	const eventText = eventPart
		? trimmedEventMessage && trimmedEventMessage.length > 0
			? trimmedEventMessage
			: buildFallbackEventText({ event: eventPart, identities })
		: (item.text?.trim() ?? "Conversation event");

	return [
		`[${item.createdAt}] Event [${buildVisibilityLabel(item.visibility)}]`,
		eventText,
	].join("\n");
}

async function loadIdentities(
	params: ExportContext
): Promise<ExportIdentityContext> {
	const [visitorRecord, aiAgent, members] = await Promise.all([
		params.conversation.visitorId
			? getCompleteVisitorWithContact(params.db, {
					visitorId: params.conversation.visitorId,
				})
			: Promise.resolve(null),
		getAiAgentForWebsite(params.db, {
			websiteId: params.website.id,
			organizationId: params.website.organizationId,
		}),
		params.website.teamId
			? getWebsiteMembers(params.db, {
					organizationId: params.website.organizationId,
					websiteTeamId: params.website.teamId,
				})
			: Promise.resolve([]),
	]);

	const visitorDisplayName =
		visitorRecord && params.conversation.visitorId
			? getVisitorNameWithFallback({
					id: visitorRecord.id,
					contact: visitorRecord.contact,
				})
			: "Visitor";

	const visitorEmail = visitorRecord?.contact?.email?.trim() ?? null;
	const visitorSummary = visitorEmail
		? `${visitorDisplayName} <${visitorEmail}>`
		: visitorDisplayName;

	const memberNameById = new Map(
		members.map((member) => [member.id, member.name ?? "Team member"])
	);

	const aiAgentNameById = new Map<string, string>();
	if (aiAgent?.id) {
		aiAgentNameById.set(aiAgent.id, aiAgent.name || "AI agent");
	}

	return {
		visitorDisplayName,
		visitorSummary,
		memberNameById,
		aiAgentNameById,
	};
}

async function loadAllTimelineItems(
	params: ExportContext
): Promise<TimelineItem[]> {
	const items: TimelineItem[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < MAX_EXPORT_PAGES; page += 1) {
		const batch = await getConversationTimelineItems(params.db, {
			organizationId: params.website.organizationId,
			conversationId: params.conversation.id,
			websiteId: params.website.id,
			limit: EXPORT_PAGE_SIZE,
			cursor,
			visibility: [
				TimelineItemVisibility.PUBLIC,
				TimelineItemVisibility.PRIVATE,
			],
		});

		if (batch.items.length === 0) {
			break;
		}

		items.unshift(
			...batch.items.filter(
				(item) => item.type === "message" || item.type === "event"
			)
		);

		if (!(batch.hasNextPage && batch.nextCursor)) {
			break;
		}

		cursor = batch.nextCursor;
	}

	return items;
}

export async function buildConversationExport(
	params: ExportContext
): Promise<ConversationExport> {
	const [items, identities] = await Promise.all([
		loadAllTimelineItems(params),
		loadIdentities(params),
	]);
	const exportedAt = new Date().toISOString();
	const bodyBlocks = items.map((item) =>
		item.type === "event"
			? formatEventBlock({ item, identities })
			: formatMessageBlock({ item, identities })
	);

	const content = [
		"Conversation Export",
		`Website: ${params.website.slug}`,
		`Conversation ID: ${params.conversation.id}`,
		`Title: ${params.conversation.title?.trim() || "Untitled conversation"}`,
		`Visitor: ${identities.visitorSummary}`,
		`Created At: ${params.conversation.createdAt}`,
		`Exported At: ${exportedAt}`,
		"Scope: full internal transcript (messages + events, public + private)",
		"",
		bodyBlocks.join("\n\n"),
	]
		.filter((segment) => segment.length > 0)
		.join("\n");

	return {
		filename: `conversation-${params.conversation.id}.txt`,
		content,
		mimeType: EXPORT_MIME_TYPE,
	};
}
