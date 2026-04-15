---
title: Events Reference
description: Listen to Support widget events for analytics, logging, and app-specific reactions.
search:
  kind: guide
  tags:
    - events
    - analytics
    - callbacks
  aliases:
    - onConversationStart
    - onConversationEnd
    - onMessageSent
    - onMessageReceived
    - onError
---

Reach for this page when prop-level customization is not enough and you need to react to widget activity in your app.

If you are still shipping the widget, start with [Overview](/docs/support-component), [Change One Thing](/docs/support-component/customization), or [Pages & Layouts](/docs/support-component/routing).

## Use this page when

- you want analytics events when visitors start or continue a conversation
- you want error logging tied to widget activity
- you are building custom pages that need to emit Support events

## Smallest working snippet

Callback props on `<Support />` are the fastest way to listen to widget events.

```tsx
import { Support } from "@cossistant/react";

export function SupportWidget() {
  return (
    <Support
      onConversationStart={({ conversationId }) => {
        analytics.track("support_conversation_started", { conversationId });
      }}
      onConversationEnd={({ conversationId }) => {
        analytics.track("support_conversation_ended", { conversationId });
      }}
      onMessageSent={({ conversationId, message }) => {
        analytics.track("support_message_sent", {
          conversationId,
          messageId: message.id,
        });
      }}
      onMessageReceived={({ conversationId, message }) => {
        analytics.track("support_message_received", {
          conversationId,
          messageId: message.id,
        });
      }}
      onError={({ error, context }) => {
        logger.error("Support widget error", { error, context });
      }}
    />
  );
}
```

## Event payloads

### onConversationStart

<auto-type-table
  path="packages/react/src/support/context/events.tsx"
  name="ConversationStartEvent"
  variant="parameter"
/>

### onConversationEnd

<auto-type-table
  path="packages/react/src/support/context/events.tsx"
  name="ConversationEndEvent"
  variant="parameter"
/>

### onMessageSent

<auto-type-table
  path="packages/react/src/support/context/events.tsx"
  name="MessageSentEvent"
  variant="parameter"
/>

### onMessageReceived

<auto-type-table
  path="packages/react/src/support/context/events.tsx"
  name="MessageReceivedEvent"
  variant="parameter"
/>

### onError

<auto-type-table
  path="packages/react/src/support/context/events.tsx"
  name="ErrorEvent"
  variant="parameter"
/>

## Subscribe inside custom UI

Use `useSupportEvents()` when the listener belongs inside a custom widget component.

```tsx
"use client";

import { useSupportEvents } from "@cossistant/react";
import { useEffect } from "react";

export function AnalyticsTracker() {
  const events = useSupportEvents();

  useEffect(() => {
    if (!events) {
      return;
    }

    const unsubscribe = events.subscribe("messageSent", (event) => {
      analytics.track("message_sent", event);
    });

    return unsubscribe;
  }, [events]);

  return null;
}
```

## Emit from custom pages

Use `useSupportEventEmitter()` when your own page or composer needs to emit the same widget events other listeners expect.

```tsx
"use client";

import { useSupportEventEmitter } from "@cossistant/react";

export function CustomConversationPage({
  conversationId,
}: {
  conversationId: string;
}) {
  const emitter = useSupportEventEmitter();

  const handleSendMessage = async (message: string) => {
    try {
      const sentMessage = await sendMessage(conversationId, message);
      emitter.emitMessageSent(conversationId, sentMessage);
    } catch (error) {
      emitter.emitError(error as Error, "message_send_failed");
    }
  };

  return <button onClick={() => void handleSendMessage("Hello")}>Send</button>;
}
```

## Next step

- [Hooks Reference](/docs/support-component/hooks) for the hook-level APIs used on this page
- [Types Reference](/docs/support-component/types) for the shared event and message types
