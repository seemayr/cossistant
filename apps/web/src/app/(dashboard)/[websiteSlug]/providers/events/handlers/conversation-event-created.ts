import { ConversationEventType, ConversationStatus } from "@cossistant/types";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import {
        type ConversationHeader,
        updateConversationHeaderInCache,
} from "@/data/conversation-header-cache";
import type { DashboardRealtimeContext } from "../types";
import { forEachConversationHeadersQuery } from "./utils/conversation-headers";

type ConversationEventCreatedEvent = RealtimeEvent<"conversationEventCreated">;

type ConversationEventMetadata = Record<string, unknown>;

function isConversationStatusValue(
        value: unknown
): value is ConversationHeader["status"] {
        if (typeof value !== "string") {
                return false;
        }

        return (Object.values(ConversationStatus) as ConversationHeader["status"][]).includes(
                value as ConversationHeader["status"]
        );
}

function computeResolutionTime(
        header: ConversationHeader,
        resolvedAt: string
): number | null {
        if (!header.startedAt) {
                return header.resolutionTime ?? null;
        }

        const resolvedTime = new Date(resolvedAt).getTime();
        const startedTime = new Date(header.startedAt).getTime();
        const diffSeconds = Math.max(0, Math.round((resolvedTime - startedTime) / 1000));

        return diffSeconds;
}

function applyConversationEventToHeader(
        header: ConversationHeader,
        event: ConversationEventCreatedEvent
): ConversationHeader {
        const eventData = event.payload.event;
        const metadata = (eventData.metadata ?? {}) as ConversationEventMetadata;

        let changed = false;
        let nextHeader = header;

        const ensureClone = () => {
                if (!changed) {
                        nextHeader = { ...header };
                        changed = true;
                }
        };

        switch (eventData.type) {
                case ConversationEventType.RESOLVED: {
                        const resolvedAt = eventData.createdAt;
                        const resolvedByUserId = eventData.actorUserId ?? null;
                        const resolvedByAiAgentId = eventData.actorAiAgentId ?? null;
                        const resolutionTime = computeResolutionTime(header, resolvedAt);

                        const shouldUpdate =
                                header.status !== ConversationStatus.RESOLVED ||
                                header.resolvedAt !== resolvedAt ||
                                header.resolvedByUserId !== resolvedByUserId ||
                                header.resolvedByAiAgentId !== resolvedByAiAgentId ||
                                header.resolutionTime !== resolutionTime;

                        if (shouldUpdate) {
                                ensureClone();
                                nextHeader.status = ConversationStatus.RESOLVED;
                                nextHeader.resolvedAt = resolvedAt;
                                nextHeader.resolvedByUserId = resolvedByUserId;
                                nextHeader.resolvedByAiAgentId = resolvedByAiAgentId;
                                nextHeader.resolutionTime = resolutionTime;
                        }
                        break;
                }
                case ConversationEventType.REOPENED: {
                        const shouldUpdate =
                                header.status !== ConversationStatus.OPEN ||
                                header.resolvedAt !== null ||
                                header.resolvedByUserId !== null ||
                                header.resolvedByAiAgentId !== null ||
                                header.resolutionTime !== null;

                        if (shouldUpdate) {
                                ensureClone();
                                nextHeader.status = ConversationStatus.OPEN;
                                nextHeader.resolvedAt = null;
                                nextHeader.resolvedByUserId = null;
                                nextHeader.resolvedByAiAgentId = null;
                                nextHeader.resolutionTime = null;
                        }
                        break;
                }
                case ConversationEventType.STATUS_CHANGED: {
                        const nextStatus = metadata.newStatus;
                        if (
                                isConversationStatusValue(nextStatus) &&
                                header.status !== nextStatus
                        ) {
                                ensureClone();
                                nextHeader.status = nextStatus;
                        }

                        if (typeof metadata.archived === "boolean") {
                                const deletedAt = metadata.archived
                                        ? eventData.createdAt
                                        : null;

                                if (header.deletedAt !== deletedAt) {
                                        ensureClone();
                                        nextHeader.deletedAt = deletedAt;
                                }
                        }
                        break;
                }
                default:
                        break;
        }

        if (!changed) {
                return header;
        }

        nextHeader.updatedAt = eventData.createdAt;

        return nextHeader;
}

function createHeaderUpdaterFromConversationEvent(
        event: ConversationEventCreatedEvent
): (header: ConversationHeader) => ConversationHeader {
        return (header) => applyConversationEventToHeader(header, event);
}

export function handleConversationEventCreated({
        event,
        context,
}: {
        event: ConversationEventCreatedEvent;
        context: DashboardRealtimeContext;
}): void {
        if (event.payload.websiteId !== context.website.id) {
                return;
        }

        const existingHeader =
                context.queryNormalizer.getObjectById<ConversationHeader>(
                        event.payload.conversationId
                );

        if (!existingHeader) {
                forEachConversationHeadersQuery(
                        context.queryClient,
                        context.website.slug,
                        (queryKey) => {
                                context.queryClient
                                        .invalidateQueries({ queryKey, exact: true })
                                        .catch((error) => {
                                                console.error(
                                                        "Failed to invalidate conversation header queries:",
                                                        error
                                                );
                                        });
                        }
                );
                return;
        }

        const updater = createHeaderUpdaterFromConversationEvent(event);
        const updatedHeader = updater(existingHeader);

        if (updatedHeader === existingHeader) {
                return;
        }

        forEachConversationHeadersQuery(
                context.queryClient,
                context.website.slug,
                (queryKey) => {
                        updateConversationHeaderInCache(
                                context.queryClient,
                                queryKey,
                                event.payload.conversationId,
                                updater
                        );
                }
        );

        context.queryNormalizer.setNormalizedData(updatedHeader);
}
