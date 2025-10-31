import {
	type AnyRealtimeEvent,
	type DefaultMessage,
	getEventPayload,
	type IdentifyContactResponse,
	type RealtimeEvent,
} from "@cossistant/types";
import type {
	CreateConversationRequestBody,
	CreateConversationResponseBody,
	GetConversationRequest,
	GetConversationResponse,
	ListConversationsRequest,
	ListConversationsResponse,
	MarkConversationSeenRequestBody,
	MarkConversationSeenResponseBody,
	SetConversationTypingResponseBody,
} from "@cossistant/types/api/conversation";
import type {
	GetConversationTimelineItemsRequest,
	GetConversationTimelineItemsResponse,
	SendTimelineItemRequest,
	SendTimelineItemResponse,
	TimelineItem,
} from "@cossistant/types/api/timeline-item";
import {
        ConversationEventType,
        ConversationStatus,
        ConversationTimelineType,
        SenderType,
        TimelineItemVisibility,
} from "@cossistant/types/enums";
import type { Conversation } from "@cossistant/types/schemas";
import { CossistantRestClient } from "./rest-client";
import {
	type ConversationsStore,
	createConversationsStore,
} from "./store/conversations-store";
import {
	createTimelineItemsStore,
	type TimelineItemsStore,
} from "./store/timeline-items-store";
import {
	createWebsiteStore,
	type WebsiteState,
	type WebsiteStore,
} from "./store/website-store";
import type {
	CossistantConfig,
	PublicWebsiteResponse,
	VisitorMetadata,
	VisitorResponse,
} from "./types";
import { generateConversationId, generateMessageId } from "./utils";

type PendingConversation = {
	conversation: Conversation;
	initialTimelineItems: TimelineItem[];
};

type InitiateConversationParams = {
	conversationId?: string;
	visitorId?: string | null;
	websiteId?: string | null;
	title?: string;
	status?: Conversation["status"];
	defaultTimelineItems?: Array<DefaultMessage | TimelineItem>;
};

type InitiateConversationResult = {
	conversationId: string;
	conversation: Conversation;
	defaultTimelineItems: TimelineItem[];
};

export class CossistantClient {
	private restClient: CossistantRestClient;
	private config: CossistantConfig;
	private pendingConversations = new Map<string, PendingConversation>();
	private websiteRequest: Promise<PublicWebsiteResponse> | null = null;
	readonly conversationsStore: ConversationsStore;
	readonly timelineItemsStore: TimelineItemsStore;
	readonly websiteStore: WebsiteStore;

	constructor(config: CossistantConfig) {
		this.config = config;
		this.restClient = new CossistantRestClient(config);
		this.conversationsStore = createConversationsStore();
		this.timelineItemsStore = createTimelineItemsStore();
		this.websiteStore = createWebsiteStore();
	}

	// Configuration updates
	updateConfiguration(config: Partial<CossistantConfig>): void {
		this.config = { ...this.config, ...config };
		this.restClient.updateConfiguration(config);
	}

	// Utility methods
	getConfiguration(): CossistantConfig {
		return { ...this.config };
	}

	// Website information
	async fetchWebsite(
		params: { force?: boolean } = {}
	): Promise<PublicWebsiteResponse> {
		const { force = false } = params;
		const current: WebsiteState = this.websiteStore.getState();

		if (!force) {
			if (current.status === "success" && current.website) {
				return current.website;
			}
			if (this.websiteRequest) {
				return this.websiteRequest;
			}
		}

		this.websiteStore.setLoading();

		const request = this.restClient
			.getWebsite()
			.then((website) => {
				this.websiteStore.setWebsite(website);
				return website;
			})
			.catch((error) => {
				this.websiteStore.setError(error);
				throw error;
			})
			.finally(() => {
				if (this.websiteRequest === request) {
					this.websiteRequest = null;
				}
			});

		this.websiteRequest = request;

		return request;
	}

	async getWebsite(): Promise<PublicWebsiteResponse> {
		return this.fetchWebsite({ force: true });
	}

	setWebsiteContext(websiteId: string, visitorId?: string): void {
		this.restClient.setWebsiteContext(websiteId, visitorId);
	}

	setVisitorBlocked(isBlocked: boolean): void {
		this.restClient.setVisitorBlocked(isBlocked);
	}

	async updateVisitorMetadata(
		metadata: VisitorMetadata
	): Promise<VisitorResponse> {
		return this.restClient.updateVisitorMetadata(metadata);
	}

	async identify(params: {
		externalId?: string;
		email?: string;
		name?: string;
		image?: string;
		metadata?: Record<string, unknown>;
		contactOrganizationId?: string;
	}): Promise<IdentifyContactResponse> {
		return this.restClient.identify(params);
	}

	async updateContactMetadata(
		metadata: Record<string, unknown>
	): Promise<VisitorResponse> {
		return this.restClient.updateContactMetadata(metadata);
	}

	// Conversation management
	initiateConversation(
		params: InitiateConversationParams = {}
	): InitiateConversationResult {
		const conversationId = params.conversationId ?? generateConversationId();
		const now = new Date().toISOString();
		const timelineItems = (params.defaultTimelineItems ?? []).map((item) =>
			normalizeBootstrapTimelineItem(conversationId, item)
		);
		const existing = this.conversationsStore.getState().byId[conversationId];
		const baseVisitorId =
			params.visitorId ?? this.restClient.getCurrentVisitorId() ?? "";
		const baseWebsiteId =
			params.websiteId ?? this.restClient.getCurrentWebsiteId() ?? "";

		const conversation: Conversation = existing
			? {
					...existing,
					title: params.title ?? existing.title,
					status: params.status ?? existing.status,
					updatedAt: now,
					lastTimelineItem: timelineItems.at(-1) ?? existing.lastTimelineItem,
				}
			: {
					id: conversationId,
					title: params.title,
					createdAt: now,
					updatedAt: now,
					visitorId: baseVisitorId,
					websiteId: baseWebsiteId,
					status: params.status ?? ConversationStatus.OPEN,
					deletedAt: null,
					lastTimelineItem: timelineItems.at(-1),
				};

		this.conversationsStore.ingestConversation(conversation);

		if (timelineItems.length > 0) {
			this.timelineItemsStore.ingestPage(conversationId, {
				items: timelineItems,
				hasNextPage: false,
				nextCursor: undefined,
			});
		}

		if (!existing || this.pendingConversations.has(conversationId)) {
			this.pendingConversations.set(conversationId, {
				conversation,
				initialTimelineItems: timelineItems,
			});
		}

		return {
			conversationId,
			conversation,
			defaultTimelineItems: timelineItems,
		};
	}

	async createConversation(
		params?: Partial<CreateConversationRequestBody>
	): Promise<CreateConversationResponseBody> {
		const response = await this.restClient.createConversation(params);
		this.conversationsStore.ingestConversation(response.conversation);
		return response;
	}

	async listConversations(
		params?: Partial<ListConversationsRequest>
	): Promise<ListConversationsResponse> {
		const response = await this.restClient.listConversations(params);
		this.conversationsStore.ingestList(response);
		return response;
	}

	async getConversation(
		params: GetConversationRequest
	): Promise<GetConversationResponse> {
		const response = await this.restClient.getConversation(params);
		this.conversationsStore.ingestConversation(response.conversation);
		return response;
	}

	async markConversationSeen(
		params: {
			conversationId: string;
		} & Partial<MarkConversationSeenRequestBody>
	): Promise<MarkConversationSeenResponseBody> {
		return this.restClient.markConversationSeen(params);
	}

	async getConversationSeenData(params: { conversationId: string }) {
		return this.restClient.getConversationSeenData(params);
	}

	async setVisitorTyping(params: {
		conversationId: string;
		isTyping: boolean;
		visitorPreview?: string | null;
		visitorId?: string;
	}): Promise<SetConversationTypingResponseBody> {
		return this.restClient.setConversationTyping(params);
	}

	// Timeline items management

	async getConversationTimelineItems(
		params: GetConversationTimelineItemsRequest & { conversationId: string }
	): Promise<GetConversationTimelineItemsResponse> {
		const response = await this.restClient.getConversationTimelineItems(params);
		this.timelineItemsStore.ingestPage(params.conversationId, {
			items: response.items,
			hasNextPage: response.hasNextPage,
			nextCursor: response.nextCursor ?? undefined,
		});
		return response;
	}

	async sendMessage(
		params: SendTimelineItemRequest & { createIfPending?: boolean }
	): Promise<
		SendTimelineItemResponse & {
			conversation?: Conversation;
			initialTimelineItems?: TimelineItem[];
			wasConversationCreated?: boolean;
		}
	> {
		const { createIfPending, ...rest } = params;
		const optimisticId = rest.item.id ?? generateMessageId();
		const createdAt = rest.item.createdAt
			? rest.item.createdAt
			: new Date().toISOString();

		// Add optimistic timeline item
		const optimisticTimelineItem: TimelineItem = {
			id: optimisticId,
			conversationId: rest.conversationId,
			organizationId: "", // Not available yet
			visibility: rest.item.visibility ?? TimelineItemVisibility.PUBLIC,
			type: rest.item.type ?? ConversationTimelineType.MESSAGE,
			text: rest.item.text,
			parts:
				rest.item.parts && rest.item.parts.length > 0
					? rest.item.parts
					: rest.item.text
						? [{ type: "text" as const, text: rest.item.text }]
						: [],
			userId: rest.item.userId ?? null,
			visitorId: rest.item.visitorId ?? null,
			aiAgentId: rest.item.aiAgentId ?? null,
			createdAt,
			deletedAt: null,
		};

		this.timelineItemsStore.ingestTimelineItem(optimisticTimelineItem);

		const pending = this.pendingConversations.get(rest.conversationId);

		if (pending && createIfPending !== false) {
			try {
				const response = await this.restClient.createConversation({
					conversationId: rest.conversationId,
					defaultTimelineItems: [
						...pending.initialTimelineItems,
						optimisticTimelineItem,
					],
				});

				this.conversationsStore.ingestConversation(response.conversation);
				this.timelineItemsStore.removeTimelineItem(
					rest.conversationId,
					optimisticId
				);
				this.timelineItemsStore.clearConversation(rest.conversationId);

				this.timelineItemsStore.ingestPage(rest.conversationId, {
					items: response.initialTimelineItems,
					hasNextPage: false,
					nextCursor: undefined,
				});

				this.pendingConversations.delete(rest.conversationId);

				const item =
					response.initialTimelineItems.at(-1) ??
					response.initialTimelineItems[0];

				return {
					item: item as TimelineItem,
					conversation: response.conversation,
					initialTimelineItems: response.initialTimelineItems,
					wasConversationCreated: true,
				} satisfies SendTimelineItemResponse & {
					conversation: Conversation;
					initialTimelineItems: TimelineItem[];
					wasConversationCreated: true;
				};
			} catch (error) {
				this.timelineItemsStore.removeTimelineItem(
					rest.conversationId,
					optimisticId
				);
				throw error;
			}
		}

		const { createdAt: _createdAt, ...restItem } = rest.item;

		const payload: SendTimelineItemRequest = {
			...rest,
			item: {
				...restItem,
				id: optimisticId,
			},
		};

		try {
			const response = await this.restClient.sendMessage(payload);

			// Finalize the timeline item
			this.timelineItemsStore.finalizeTimelineItem(
				rest.conversationId,
				optimisticId,
				response.item
			);
			return response;
		} catch (error) {
			this.timelineItemsStore.removeTimelineItem(
				rest.conversationId,
				optimisticId
			);
			throw error;
		}
	}

        handleRealtimeEvent(event: AnyRealtimeEvent): void {
                switch (event.type) {
                        case "conversationCreated": {
                                const { conversation } = event.payload;

                                this.conversationsStore.ingestConversation({
                                        ...conversation,
                                        lastTimelineItem:
                                                conversation.lastTimelineItem ?? undefined,
                                });
                                break;
                        }
                        case "timelineItemCreated": {
                                const timelineItem =
                                        this.timelineItemsStore.ingestRealtimeTimelineItem(event);

                                const existingConversation =
                                        this.conversationsStore.getState().byId[
                                                timelineItem.conversationId
                                        ];

                                if (!existingConversation) {
                                        break;
                                }

                                const nextConversation = {
                                        ...existingConversation,
                                        updatedAt: timelineItem.createdAt,
                                        lastTimelineItem: timelineItem,
                                };

                                this.conversationsStore.ingestConversation(nextConversation);
                                break;
                        }
                        case "conversationEventCreated": {
                                const existingConversation =
                                        this.conversationsStore.getState().byId[
                                                event.payload.conversationId
                                        ];

                                if (!existingConversation) {
                                        break;
                                }

                                const nextConversation = applyConversationEventToConversation(
                                        existingConversation,
                                        event
                                );

                                if (nextConversation) {
                                        this.conversationsStore.ingestConversation(nextConversation);
                                }
                                break;
                        }
                        default:
                                break;
                }
        }

	// Cleanup method
	destroy(): void {
		// No cleanup needed for REST client
	}
}

function isConversationStatusValue(
        value: unknown
): value is Conversation["status"] {
        if (typeof value !== "string") {
                return false;
        }

        return (Object.values(ConversationStatus) as Conversation["status"][]).includes(
                value as Conversation["status"]
        );
}

function applyConversationEventToConversation(
        conversation: Conversation,
        event: RealtimeEvent<"conversationEventCreated">
): Conversation | null {
        const eventData = event.payload.event;
        const metadata = (eventData.metadata ?? {}) as Record<string, unknown>;

        let changed = false;
        let nextConversation = conversation;

        const ensureClone = () => {
                if (!changed) {
                        nextConversation = { ...conversation };
                        changed = true;
                }
        };

        switch (eventData.type) {
                case ConversationEventType.RESOLVED: {
                        if (conversation.status !== ConversationStatus.RESOLVED) {
                                ensureClone();
                                nextConversation.status = ConversationStatus.RESOLVED;
                        }
                        break;
                }
                case ConversationEventType.REOPENED: {
                        if (conversation.status !== ConversationStatus.OPEN) {
                                ensureClone();
                                nextConversation.status = ConversationStatus.OPEN;
                        }
                        break;
                }
                case ConversationEventType.STATUS_CHANGED: {
                        const nextStatus = metadata.newStatus;

                        if (isConversationStatusValue(nextStatus)) {
                                if (conversation.status !== nextStatus) {
                                        ensureClone();
                                        nextConversation.status = nextStatus;
                                }
                        }

                        if (typeof metadata.archived === "boolean") {
                                const deletedAt = metadata.archived
                                        ? eventData.createdAt
                                        : null;

                                if (conversation.deletedAt !== deletedAt) {
                                        ensureClone();
                                        nextConversation.deletedAt = deletedAt;
                                }
                        }

                        break;
                }
                default:
                        break;
        }

        if (!changed) {
                return null;
        }

        nextConversation.updatedAt = eventData.createdAt;

        return nextConversation;
}

function normalizeBootstrapTimelineItem(
        conversationId: string,
        item: DefaultMessage | TimelineItem
): TimelineItem {
	if (isDefaultMessage(item)) {
		const createdAt = new Date().toISOString();

		return {
			id: generateMessageId(),
			conversationId,
			organizationId: "", // Not available at this point
			type: ConversationTimelineType.MESSAGE,
			text: item.content,
			parts: [{ type: "text" as const, text: item.content }],
			visibility: TimelineItemVisibility.PUBLIC,
			userId:
				item.senderType === SenderType.TEAM_MEMBER
					? (item.senderId ?? null)
					: null,
			aiAgentId:
				item.senderType === SenderType.AI ? (item.senderId ?? null) : null,
			visitorId:
				item.senderType === SenderType.VISITOR ? (item.senderId ?? null) : null,
			createdAt,
			deletedAt: null,
		} satisfies TimelineItem;
	}

	const createdAt = item.createdAt ? item.createdAt : new Date().toISOString();

	return {
		...item,
		id: item.id ?? generateMessageId(),
		conversationId,
		organizationId: item.organizationId || "",
		type: item.type ?? ConversationTimelineType.MESSAGE,
		createdAt,
		deletedAt: item.deletedAt ?? null,
		userId: item.userId ?? null,
		aiAgentId: item.aiAgentId ?? null,
		visitorId: item.visitorId ?? null,
		visibility: item.visibility ?? TimelineItemVisibility.PUBLIC,
	} satisfies TimelineItem;
}

function isDefaultMessage(
	item: DefaultMessage | TimelineItem
): item is DefaultMessage {
	return (item as DefaultMessage).content !== undefined;
}
