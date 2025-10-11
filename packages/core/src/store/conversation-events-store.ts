import type { ConversationEvent, RealtimeEvent } from "@cossistant/types";
import { createStore, type Store } from "./create-store";

type ConversationEventCreatedEvent = RealtimeEvent<"conversationEventCreated">;

export type ConversationEventsState = {
  events: ConversationEvent[];
  hasNextPage: boolean;
  nextCursor?: string;
};

export type ConversationEventsStoreState = {
  conversations: Record<string, ConversationEventsState>;
};

const INITIAL_STATE: ConversationEventsStoreState = {
  conversations: {},
};

function sortEvents(events: ConversationEvent[]): ConversationEvent[] {
  return [...events].sort((a, b) => {
    const timeDiff =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return a.id.localeCompare(b.id);
  });
}

function isSameDate(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  if (a === b) {
    return true;
  }

  if (!(a && b)) {
    return !(a || b);
  }

  return new Date(a).getTime() === new Date(b).getTime();
}

function isSameMetadata(
  a?: Record<string, unknown>,
  b?: Record<string, unknown>,
): boolean {
  if (a === b) {
    return true;
  }

  if (!(a && b)) {
    return !(a || b);
  }

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function isSameEvent(a: ConversationEvent, b: ConversationEvent): boolean {
  return (
    a.id === b.id &&
    a.organizationId === b.organizationId &&
    a.conversationId === b.conversationId &&
    a.type === b.type &&
    a.actorUserId === b.actorUserId &&
    a.actorAiAgentId === b.actorAiAgentId &&
    a.targetUserId === b.targetUserId &&
    a.targetAiAgentId === b.targetAiAgentId &&
    a.message === b.message &&
    isSameMetadata(a.metadata, b.metadata) &&
    isSameDate(a.createdAt, b.createdAt) &&
    isSameDate(a.updatedAt, b.updatedAt) &&
    isSameDate(a.deletedAt, b.deletedAt)
  );
}

function mergeEvents(
  existing: ConversationEvent[],
  incoming: ConversationEvent[],
): ConversationEvent[] {
  if (incoming.length === 0) {
    return existing;
  }

  const byId = new Map<string, ConversationEvent>();
  for (const event of existing) {
    byId.set(event.id, event);
  }

  let changed = false;
  for (const event of incoming) {
    const previous = byId.get(event.id);
    if (!(previous && isSameEvent(previous, event))) {
      changed = true;
    }
    byId.set(event.id, event);
  }

  if (!changed && byId.size === existing.length) {
    let stable = true;
    for (const event of existing) {
      if (byId.get(event.id) !== event) {
        stable = false;
        break;
      }
    }

    if (stable) {
      return existing;
    }
  }

  return sortEvents(Array.from(byId.values()));
}

function applyPage(
  state: ConversationEventsStoreState,
  conversationId: string,
  page: Pick<ConversationEventsState, "events" | "hasNextPage" | "nextCursor">,
): ConversationEventsStoreState {
  const existing = state.conversations[conversationId];
  const mergedEvents = mergeEvents(existing?.events ?? [], page.events);

  if (
    existing &&
    existing.events === mergedEvents &&
    existing.hasNextPage === page.hasNextPage &&
    existing.nextCursor === page.nextCursor
  ) {
    return state;
  }

  return {
    ...state,
    conversations: {
      ...state.conversations,
      [conversationId]: {
        events: mergedEvents,
        hasNextPage: page.hasNextPage,
        nextCursor: page.nextCursor,
      },
    },
  };
}

function applyEvent(
  state: ConversationEventsStoreState,
  event: ConversationEvent,
): ConversationEventsStoreState {
  const existing = state.conversations[event.conversationId];
  const mergedEvents = mergeEvents(existing?.events ?? [], [event]);

  if (existing && existing.events === mergedEvents) {
    return state;
  }

  return {
    ...state,
    conversations: {
      ...state.conversations,
      [event.conversationId]: {
        events: mergedEvents,
        hasNextPage: existing?.hasNextPage ?? false,
        nextCursor: existing?.nextCursor,
      },
    },
  };
}

function removeConversation(
  state: ConversationEventsStoreState,
  conversationId: string,
): ConversationEventsStoreState {
  if (!state.conversations[conversationId]) {
    return state;
  }

  const { [conversationId]: _removed, ...rest } = state.conversations;

  return {
    ...state,
    conversations: rest,
  };
}

function normalizeRealtimeEvent(
  event: ConversationEventCreatedEvent,
): ConversationEvent {
  const raw = event.payload.event;
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    organizationId: raw.organizationId,
    type: raw.type as ConversationEvent["type"],
    actorUserId: raw.actorUserId ?? null,
    actorAiAgentId: raw.actorAiAgentId ?? null,
    targetUserId: raw.targetUserId ?? null,
    targetAiAgentId: raw.targetAiAgentId ?? null,
    message: raw.message ?? undefined,
    metadata: raw.metadata
      ? (raw.metadata as Record<string, unknown>)
      : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt ?? raw.createdAt,
    deletedAt: raw.deletedAt ?? null,
  };
}

export type ConversationEventsStore = Store<ConversationEventsStoreState> & {
  ingestPage(conversationId: string, page: ConversationEventsState): void;
  ingestEvent(conversationId: string, event: ConversationEvent): void;
  ingestRealtime(event: ConversationEventCreatedEvent): ConversationEvent;
  clearConversation(conversationId: string): void;
};

export function createConversationEventsStore(): ConversationEventsStore {
  const store = createStore<ConversationEventsStoreState>(INITIAL_STATE);

  return {
    ...store,
    ingestPage(conversationId, page) {
      store.setState((state) => applyPage(state, conversationId, page));
    },
    ingestEvent(_conversationId, event) {
      store.setState((state) => applyEvent(state, event));
    },
    ingestRealtime(event) {
      const normalized = normalizeRealtimeEvent(event);
      store.setState((state) => applyEvent(state, normalized));

      return normalized;
    },
    clearConversation(conversationId) {
      store.setState((state) => removeConversation(state, conversationId));
    },
  };
}
