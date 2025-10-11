import { describe, expect, it } from "bun:test";
import type { ConversationEvent, RealtimeEvent } from "@cossistant/types";
import { ConversationEventType } from "@cossistant/types/enums";
import { createConversationEventsStore } from "./conversation-events-store";

type ConversationEventCreatedEvent = RealtimeEvent<"conversationEventCreated">;

function createMockEvent(
  overrides: Partial<ConversationEvent> = {},
): ConversationEvent {
  const base: ConversationEvent = {
    id: "evt-1",
    conversationId: "conv-1",
    organizationId: "org-1",
    type: ConversationEventType.STATUS_CHANGED,
    actorUserId: "user-1",
    actorAiAgentId: null,
    targetUserId: null,
    targetAiAgentId: null,
    message: undefined,
    metadata: { archived: true },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  return { ...base, ...overrides };
}

function createRealtimeEvent(
  overrides: Partial<ConversationEventCreatedEvent["payload"]> = {},
): ConversationEventCreatedEvent {
  const createdAt = overrides.event?.createdAt ?? "2024-01-02T00:00:00.000Z";
  return {
    type: "conversationEventCreated",
    payload: {
      websiteId: "site-1",
      organizationId: "org-1",
      conversationId: "conv-1",
      visitorId: null,
      userId: "user-1",
      aiAgentId: null,
      event: {
        id: "evt-realtime",
        conversationId: "conv-1",
        organizationId: "org-1",
        type: ConversationEventType.STATUS_CHANGED,
        actorUserId: "user-1",
        actorAiAgentId: null,
        targetUserId: null,
        targetAiAgentId: null,
        metadata: { archived: false },
        message: undefined,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
        ...overrides.event,
      },
      ...overrides,
    },
  };
}

describe("conversation events store", () => {
  it("ingests paginated events and sorts them", () => {
    const store = createConversationEventsStore();
    const newer = createMockEvent({
      id: "evt-2",
      createdAt: "2024-01-03T00:00:00.000Z",
    });
    const older = createMockEvent({
      id: "evt-0",
      createdAt: "2023-12-31T23:59:59.000Z",
    });

    store.ingestPage("conv-1", {
      events: [newer, older],
      hasNextPage: false,
      nextCursor: undefined,
    });

    const events = store.getState().conversations["conv-1"]?.events ?? [];
    expect(events.map((event) => event.id)).toEqual(["evt-0", "evt-2"]);
  });

  it("ingests realtime events", () => {
    const store = createConversationEventsStore();
    const realtimeEvent = createRealtimeEvent();

    const normalized = store.ingestRealtime(realtimeEvent);

    expect(normalized.id).toBe("evt-realtime");
    const events = store.getState().conversations["conv-1"]?.events ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("evt-realtime");
  });

  it("clears conversation events", () => {
    const store = createConversationEventsStore();
    store.ingestPage("conv-1", {
      events: [createMockEvent()],
      hasNextPage: false,
      nextCursor: undefined,
    });

    expect(store.getState().conversations["conv-1"]).toBeDefined();

    store.clearConversation("conv-1");

    expect(store.getState().conversations["conv-1"]).toBeUndefined();
  });
});
