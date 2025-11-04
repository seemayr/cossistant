import { db } from "@api/db";
import { env } from "@api/env";
import { sendEmail } from "@api/lib/resend";
import {
        conversation,
        conversationAssignee,
        conversationParticipant,
        conversationSeen,
        conversationTimelineItem,
} from "@api/db/schema";
import { member, user } from "@api/db/schema/auth";
import { website } from "@api/db/schema/website";
import {
        ConversationParticipationStatus,
        ConversationTimelineType,
        TimelineItemVisibility,
} from "@cossistant/types";
import { ConversationUnseenDigestEmail } from "@cossistant/transactional/emails/conversation-unseen-digest";
import { serve } from "@upstash/workflow/hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";

// Needed for email templates, don't remove
import React from "react";

import type { ConversationUnseenDigestData } from "./types";

type RawTimelineMessage = {
        id: string;
        text: string | null;
        parts: unknown;
        createdAt: string;
        userId: string | null;
        visitorId: string | null;
        aiAgentId: string | null;
};

type MemberInfo = {
        userId: string;
        email: string;
        name: string | null;
};

const MAX_MESSAGES_PER_EMAIL = 10;

const parseOptionalTimestamp = (value: string | null | undefined, fallback: number): number => {
        if (!value) {
                return fallback;
        }

        const parsed = Date.parse(value);

        if (Number.isNaN(parsed)) {
                return fallback;
        }

        return parsed;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, maxLength = 240): string => {
        if (value.length <= maxLength) {
                return value;
        }

        const truncated = value.slice(0, maxLength - 1).trimEnd();
        return `${truncated}\u2026`;
};

const extractMessagePreview = (message: RawTimelineMessage): string => {
        if (typeof message.text === "string" && message.text.trim().length > 0) {
                return normalizeWhitespace(message.text);
        }

        if (Array.isArray(message.parts)) {
                for (const part of message.parts) {
                        if (part && typeof part === "object" && "type" in part) {
                                const type = (part as { type?: unknown }).type;
                                const text = (part as { text?: unknown }).text;

                                if (type === "text" && typeof text === "string") {
                                        return normalizeWhitespace(text);
                                }
                        }
                }
        }

        return "New message";
};

const getSenderLabel = (message: RawTimelineMessage, members: Map<string, MemberInfo>): string => {
        if (message.userId) {
                const memberInfo = members.get(message.userId);
                return memberInfo?.name?.trim() || "Team member";
        }

        if (message.aiAgentId) {
                return "AI assistant";
        }

        return "Visitor";
};

const conversationsWorkflow = new Hono();

conversationsWorkflow.post(
        "/unseen-digest",
        serve<ConversationUnseenDigestData>(async (context) => {
                const { conversationId, organizationId } = context.requestPayload;

                await context.run("notify-unseen-messages", async () => {
                        const [conversationRecord] = await db
                                .select({
                                        id: conversation.id,
                                        title: conversation.title,
                                        websiteId: conversation.websiteId,
                                })
                                .from(conversation)
                                .where(
                                        and(
                                                eq(conversation.id, conversationId),
                                                eq(conversation.organizationId, organizationId)
                                        )
                                )
                                .limit(1);

                        if (!conversationRecord) {
                                console.warn("Conversation not found for unseen digest", {
                                        conversationId,
                                        organizationId,
                                });
                                return;
                        }

                        const [messagesRows, seenRows, participantRows, assigneeRows, memberRows, websiteRecord] =
                                await Promise.all([
                                        db
                                                .select({
                                                        id: conversationTimelineItem.id,
                                                        text: conversationTimelineItem.text,
                                                        parts: conversationTimelineItem.parts,
                                                        createdAt: conversationTimelineItem.createdAt,
                                                        userId: conversationTimelineItem.userId,
                                                        visitorId: conversationTimelineItem.visitorId,
                                                        aiAgentId: conversationTimelineItem.aiAgentId,
                                                })
                                                .from(conversationTimelineItem)
                                                .where(
                                                        and(
                                                                eq(
                                                                        conversationTimelineItem.organizationId,
                                                                        organizationId
                                                                ),
                                                                eq(
                                                                        conversationTimelineItem.conversationId,
                                                                        conversationId
                                                                ),
                                                                eq(
                                                                        conversationTimelineItem.type,
                                                                        ConversationTimelineType.MESSAGE
                                                                ),
                                                                eq(
                                                                        conversationTimelineItem.visibility,
                                                                        TimelineItemVisibility.PUBLIC
                                                                ),
                                                                isNull(conversationTimelineItem.deletedAt)
                                                        )
                                                )
                                                .orderBy(
                                                        desc(conversationTimelineItem.createdAt),
                                                        desc(conversationTimelineItem.id)
                                                )
                                                .limit(50),
                                        db
                                                .select({
                                                        userId: conversationSeen.userId,
                                                        lastSeenAt: conversationSeen.lastSeenAt,
                                                })
                                                .from(conversationSeen)
                                                .where(
                                                        and(
                                                                eq(conversationSeen.organizationId, organizationId),
                                                                eq(conversationSeen.conversationId, conversationId),
                                                                isNull(conversationSeen.visitorId),
                                                                isNull(conversationSeen.aiAgentId)
                                                        )
                                                ),
                                        db
                                                .select({ userId: conversationParticipant.userId })
                                                .from(conversationParticipant)
                                                .where(
                                                        and(
                                                                eq(
                                                                        conversationParticipant.organizationId,
                                                                        organizationId
                                                                ),
                                                                eq(
                                                                        conversationParticipant.conversationId,
                                                                        conversationId
                                                                ),
                                                                eq(
                                                                        conversationParticipant.status,
                                                                        ConversationParticipationStatus.ACTIVE
                                                                ),
                                                                isNull(conversationParticipant.leftAt)
                                                        )
                                                ),
                                        db
                                                .select({ userId: conversationAssignee.userId })
                                                .from(conversationAssignee)
                                                .where(
                                                        and(
                                                                eq(conversationAssignee.organizationId, organizationId),
                                                                eq(conversationAssignee.conversationId, conversationId),
                                                                isNull(conversationAssignee.unassignedAt)
                                                        )
                                                ),
                                        db
                                                .select({
                                                        userId: member.userId,
                                                        email: user.email,
                                                        name: user.name,
                                                })
                                                .from(member)
                                                .innerJoin(user, eq(member.userId, user.id))
                                                .where(eq(member.organizationId, organizationId)),
                                        db
                                                .select({ slug: website.slug })
                                                .from(website)
                                                .where(eq(website.id, conversationRecord.websiteId))
                                                .limit(1),
                                ]);

                        if (messagesRows.length === 0) {
                                return;
                        }

                        const messages: RawTimelineMessage[] = messagesRows.slice().reverse();

                        const candidateUserIds = new Set<string>();
                        for (const row of seenRows) {
                                if (row.userId) {
                                        candidateUserIds.add(row.userId);
                                }
                        }
                        for (const row of participantRows) {
                                if (row.userId) {
                                        candidateUserIds.add(row.userId);
                                }
                        }
                        for (const row of assigneeRows) {
                                if (row.userId) {
                                        candidateUserIds.add(row.userId);
                                }
                        }

                        const uniqueMembers = new Map<string, MemberInfo>();
                        for (const memberRow of memberRows) {
                                uniqueMembers.set(memberRow.userId, memberRow);
                        }

                        const membersMap = uniqueMembers;

                        const targetMembers: MemberInfo[] =
                                candidateUserIds.size > 0
                                        ? Array.from(candidateUserIds)
                                                  .map((userId) => membersMap.get(userId))
                                                  .filter((value): value is MemberInfo => Boolean(value))
                                        : Array.from(membersMap.values());

                        if (targetMembers.length === 0) {
                                return;
                        }

                        const seenMap = new Map<string, string | null>();
                        for (const row of seenRows) {
                                if (row.userId) {
                                        seenMap.set(row.userId, row.lastSeenAt ?? null);
                                }
                        }

                        const appBaseUrl = env.PUBLIC_APP_URL.replace(/\/$/, "");
                        const conversationTitle = conversationRecord.title?.trim() || "Visitor conversation";
                        const websiteSlug = websiteRecord[0]?.slug ?? null;
                        const conversationUrl = websiteSlug
                                ? `${appBaseUrl}/${websiteSlug}/inbox/${conversationId}`
                                : `${appBaseUrl}/inbox/${conversationId}`;
                        const notificationSettingsUrl = `${appBaseUrl}/settings/notifications`;

                        const notifications = targetMembers
                                .map((memberInfo) => {
                                        const lastSeenTimestamp = parseOptionalTimestamp(
                                                seenMap.get(memberInfo.userId) ?? null,
                                                Number.NEGATIVE_INFINITY
                                        );

                                        const unseenMessages = messages.filter((message) => {
                                                const messageTimestamp = parseOptionalTimestamp(
                                                        message.createdAt,
                                                        Number.POSITIVE_INFINITY
                                                );

                                                if (messageTimestamp <= lastSeenTimestamp) {
                                                        return false;
                                                }

                                                if (message.userId && message.userId === memberInfo.userId) {
                                                        return false;
                                                }

                                                return true;
                                        });

                                        if (unseenMessages.length === 0) {
                                                return null;
                                        }

                                        const recentMessages = unseenMessages.slice(-MAX_MESSAGES_PER_EMAIL);

                                        return {
                                                member: memberInfo,
                                                messages: recentMessages.map((message) => ({
                                                        sender: getSenderLabel(message, membersMap),
                                                        preview: truncate(extractMessagePreview(message)),
                                                        createdAt: message.createdAt,
                                                })),
                                                total: unseenMessages.length,
                                        };
                                })
                                .filter((value): value is {
                                        member: MemberInfo;
                                        messages: Array<{
                                                sender: string;
                                                preview: string;
                                                createdAt: string;
                                        }>;
                                        total: number;
                                } => Boolean(value));

                        if (notifications.length === 0) {
                                return;
                        }

                        await Promise.all(
                                notifications.map((notification) =>
                                        sendEmail({
                                                to: [notification.member.email],
                                                subject: `${notification.total} unread ${
                                                        notification.total === 1 ? "message" : "messages"
                                                } in ${conversationTitle}`,
                                                refId: `conversation-unseen-${conversationId}-${notification.member.userId}`,
                                                variant: "notifications",
                                                tags: [
                                                        {
                                                                name: "template",
                                                                value: "conversation-unseen-digest",
                                                        },
                                                        {
                                                                name: "conversationId",
                                                                value: conversationId,
                                                        },
                                                ],
                                                content: (
                                                        <ConversationUnseenDigestEmail
                                                                conversationTitle={conversationTitle}
                                                                conversationUrl={conversationUrl}
                                                                messages={notification.messages}
                                                                notificationSettingsUrl={notificationSettingsUrl}
                                                                recipientEmail={notification.member.email}
                                                                recipientName={notification.member.name}
                                                                totalMessages={notification.total}
                                                        />
                                                ),
                                        })
                                )
                        );
                });
        })
);

export default conversationsWorkflow;
