import { markUserPresence, markVisitorPresence } from "@api/services/presence";
import type {
	AnyRealtimeEvent,
	RealtimeEvent,
	RealtimeEventType,
} from "@cossistant/types/realtime-events";

type DispatchOptions = {
	exclude?: string | string[];
};

type ConnectionDispatcher = (
	connectionId: string,
	event: AnyRealtimeEvent
) => void;

type VisitorDispatcher = (
	visitorId: string,
	event: AnyRealtimeEvent,
	options?: DispatchOptions
) => void;

type WebsiteDispatcher = (
	websiteId: string,
	event: AnyRealtimeEvent,
	options?: DispatchOptions
) => void;

type EventContext = {
	connectionId: string;
	userId?: string;
	visitorId?: string;
	websiteId?: string;
	organizationId?: string;
	ws?: WebSocket;
	sendToConnection?: ConnectionDispatcher;
	sendToVisitor?: VisitorDispatcher;
	sendToWebsite?: WebsiteDispatcher;
};

type EventHandler<T extends RealtimeEventType> = (
	ctx: EventContext,
	event: RealtimeEvent<T>
) => Promise<void> | void;

type EventHandlers = {
	[K in RealtimeEventType]: EventHandler<K>;
};

type WebsiteDispatchRule = boolean | { excludeConnection?: boolean };

type DispatchRule = {
	website: WebsiteDispatchRule;
	visitor: boolean;
};

type DispatchRuleOverrides = Partial<DispatchRule>;

const DEFAULT_DISPATCH_RULE: DispatchRule = {
	website: true,
	visitor: true,
};

const dispatchRules: Partial<Record<RealtimeEventType, DispatchRuleOverrides>> =
	{
		userConnected: { website: { excludeConnection: true }, visitor: false },
		userDisconnected: { website: { excludeConnection: true }, visitor: false },
		userPresenceUpdate: {
			website: { excludeConnection: true },
			visitor: false,
		},
		visitorConnected: { website: true, visitor: false },
		visitorDisconnected: { website: true, visitor: false },
		conversationEventCreated: { website: true, visitor: true },
		conversationCreated: { website: true, visitor: true },
		conversationSeen: { website: true, visitor: true },
		conversationTyping: { website: true, visitor: true },
		timelineItemCreated: { website: true, visitor: true },
		visitorIdentified: { website: true, visitor: true },
		// Conversation updated events (title, sentiment, escalation)
		conversationUpdated: { website: true, visitor: true },
		// Web crawling events - only dispatch to website (dashboard users)
		crawlStarted: { website: true, visitor: false },
		crawlProgress: { website: true, visitor: false },
		crawlCompleted: { website: true, visitor: false },
		crawlFailed: { website: true, visitor: false },
		linkSourceUpdated: { website: true, visitor: false },
		crawlPagesDiscovered: { website: true, visitor: false },
		crawlPageCompleted: { website: true, visitor: false },
		// AI agent processing events - dispatch to both for progress updates
		aiAgentProcessingStarted: { website: true, visitor: true },
		aiAgentProcessingProgress: { website: true, visitor: true },
		aiAgentProcessingCompleted: { website: true, visitor: true },
		// Timeline item update events
		timelineItemUpdated: { website: true, visitor: true },
		timelineItemPartUpdated: { website: true, visitor: true },
	};

function resolveWebsiteDispatchOptions(
	rule: WebsiteDispatchRule | undefined,
	ctx: EventContext
): DispatchOptions | undefined {
	if (!rule) {
		return;
	}

	if (typeof rule === "boolean") {
		return;
	}

	if (rule.excludeConnection && ctx.connectionId) {
		return { exclude: ctx.connectionId } satisfies DispatchOptions;
	}

	return;
}

function dispatchEvent<T extends RealtimeEventType>(
	ctx: EventContext,
	event: RealtimeEvent<T>,
	rules: DispatchRule
): void {
	const websiteTarget = event.payload.websiteId ?? ctx.websiteId;
	if (websiteTarget && ctx.sendToWebsite && rules.website) {
		const options = resolveWebsiteDispatchOptions(rules.website, ctx);
		ctx.sendToWebsite(websiteTarget, event as AnyRealtimeEvent, options);
	}

	if (rules.visitor && event.payload.visitorId && ctx.sendToVisitor) {
		ctx.sendToVisitor(event.payload.visitorId, event as AnyRealtimeEvent);
	}
}

/**
 * Event handlers for each realtime event type
 * Each handler receives context, the full event payload, and forwards it to
 * relevant local connections using the provided dispatch helpers.
 */
const eventHandlers: EventHandlers = {
	userConnected: async (_ctx, event) => {
		const data = event.payload;
		const lastSeenAt = new Date().toISOString();

		if (!data.userId) {
			return;
		}

		void markUserPresence({
			websiteId: data.websiteId,
			userId: data.userId,
			lastSeenAt,
		});
	},

	userDisconnected: async (_ctx, event) => {
		const data = event.payload;
		const lastSeenAt = new Date().toISOString();

		if (!data.userId) {
			return;
		}

		void markUserPresence({
			websiteId: data.websiteId,
			userId: data.userId,
			lastSeenAt,
		});
	},

	visitorConnected: async (_ctx, event) => {
		const data = event.payload;
		const lastSeenAt = new Date().toISOString();

		void markVisitorPresence({
			websiteId: data.websiteId,
			visitorId: data.visitorId,
			lastSeenAt,
		});
	},

	visitorDisconnected: async (_ctx, event) => {
		const data = event.payload;
		const lastSeenAt = new Date().toISOString();

		void markVisitorPresence({
			websiteId: data.websiteId,
			visitorId: data.visitorId,
			lastSeenAt,
		});
	},

	userPresenceUpdate: (_ctx, event) => {
		const _data = event.payload;
	},

	timelineItemCreated: (_ctx, event) => {
		const _data = event.payload;
	},

	conversationSeen: (_ctx, event) => {
		const _data = event.payload;
	},

	conversationTyping: (_ctx, event) => {
		const _data = event.payload;
	},

	conversationEventCreated: (_ctx, event) => {
		const _data = event.payload;
	},

	conversationCreated: (_ctx, event) => {
		const _data = event.payload;
	},
	visitorIdentified: (_ctx, event) => {
		const _data = event.payload;
	},
	// Conversation updated (title, sentiment, escalation)
	conversationUpdated: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
	// Web crawling event handlers
	crawlStarted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlProgress: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlCompleted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlFailed: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	linkSourceUpdated: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlPagesDiscovered: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlPageCompleted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	// AI agent processing events
	aiAgentProcessingStarted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
	aiAgentProcessingProgress: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
	aiAgentProcessingCompleted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
	// Timeline item update events
	timelineItemUpdated: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
	timelineItemPartUpdated: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
};

/**
 * Routes an event to its appropriate handler
 */
export async function routeEvent<T extends RealtimeEventType>(
	event: RealtimeEvent<T>,
	context: EventContext
): Promise<void> {
	const handler = eventHandlers[event.type] as EventHandler<T>;

	if (!handler) {
		console.error(
			`[EventRouter] No handler found for event type: ${event.type}`
		);
		return;
	}

	try {
		await handler(context, event);
	} catch (error) {
		console.error(`[EventRouter] Error handling ${event.type}:`, error);
	}

	const overrides = dispatchRules[event.type];
	const rules: DispatchRule = {
		website: overrides?.website ?? DEFAULT_DISPATCH_RULE.website,
		visitor: overrides?.visitor ?? DEFAULT_DISPATCH_RULE.visitor,
	};

	dispatchEvent(context, event, rules);
}

export type {
	ConnectionDispatcher,
	DispatchOptions,
	EventContext,
	EventHandler,
	VisitorDispatcher,
	WebsiteDispatcher,
};
