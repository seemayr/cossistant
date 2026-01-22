# Implementation Plan: AI SDK v6 Compatible Timeline Items

## Executive Summary

This plan outlines how to make Cossistant's timeline items compatible with Vercel AI SDK v6 types, enabling rich AI agent features like tool invocations, reasoning visibility, source attribution, and privacy controls.

---

## 0. Architectural Difference: WebSocket Progressive Updates vs Streaming

### AI SDK Approach (Streaming)
```
Client ←──── SSE Stream ────── Server
       token by token, real-time
```
- Direct connection between client and AI model
- Text streams token-by-token
- Part states like `streaming` mean "currently receiving tokens"

### Cossistant Approach (Background Jobs + WebSocket)
```
Widget ←── WebSocket ──→ API Server ←── Redis Pub/Sub ──→ Worker
                              ↓
                           Database
```
- AI processing happens in background workers (BullMQ)
- Workers create/update timeline items in the database
- WebSocket events notify clients of changes
- Clients fetch or receive full updated timeline items

### Key Implications

| Aspect | AI SDK Streaming | Cossistant WebSocket |
|--------|------------------|----------------------|
| Text delivery | Token by token | Full text or chunks |
| Part state meaning | "Currently streaming" | "Processing phase" |
| Updates | Append-only stream | Full item replacement |
| Connection | Direct to model | Via event bus |
| Offline resilience | Lost on disconnect | Persisted in DB |

### Redefining Part States for Cossistant

Instead of streaming states, we use **processing states**:

```typescript
// AI SDK v6 states (streaming-oriented)
type StreamingState = 'streaming' | 'done';

// Cossistant states (job-oriented)
type ProcessingState =
  | 'pending'      // Part created, waiting for processing
  | 'processing'   // Worker actively working on this
  | 'completed'    // Successfully finished
  | 'error';       // Failed with error

// For tool parts specifically
type ToolProcessingState =
  | 'pending'           // Tool call queued
  | 'executing'         // Tool is running
  | 'awaiting-input'    // Needs user input (like identification)
  | 'completed'         // Tool finished successfully
  | 'error';            // Tool failed
```

### New WebSocket Events Needed

```typescript
// In realtime-events.ts - add these new events

// When a timeline item's parts are updated
timelineItemUpdated: baseRealtimeEvent.extend({
  conversationId: z.string(),
  itemId: z.string(),
  // Partial update - only changed fields
  updates: z.object({
    text: z.string().nullable().optional(),
    parts: z.array(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
}),

// AI agent started processing a response
aiAgentProcessingStarted: baseRealtimeEvent.extend({
  conversationId: z.string(),
  aiAgentId: z.string(),
  // The timeline item being worked on (may not exist yet)
  timelineItemId: z.string().nullable(),
  // What triggered this (message ID being responded to)
  triggerMessageId: z.string(),
}),

// AI agent processing progress update
aiAgentProcessingProgress: baseRealtimeEvent.extend({
  conversationId: z.string(),
  aiAgentId: z.string(),
  timelineItemId: z.string(),
  // Current phase
  phase: z.enum([
    'thinking',           // Analyzing the conversation
    'searching-knowledge', // Looking up knowledge base
    'generating',         // Generating response
    'using-tool',         // Executing a tool
    'finalizing',         // Wrapping up
  ]),
  // Optional details about current phase
  details: z.object({
    toolName: z.string().optional(),
    toolCallId: z.string().optional(),
    knowledgeQuery: z.string().optional(),
  }).optional(),
}),

// AI agent finished (success or error)
aiAgentProcessingCompleted: baseRealtimeEvent.extend({
  conversationId: z.string(),
  aiAgentId: z.string(),
  timelineItemId: z.string(),
  status: z.enum(['success', 'error', 'escalated']),
  errorMessage: z.string().optional(),
}),

// Part-specific update (for granular UI updates)
timelineItemPartUpdated: baseRealtimeEvent.extend({
  conversationId: z.string(),
  itemId: z.string(),
  partIndex: z.number(),
  part: z.unknown(), // The updated part
}),
```

### Progressive Update Flow Example

```
1. Visitor sends message
   └─→ timelineItemCreated (visitor's message)

2. AI agent job queued
   └─→ aiAgentProcessingStarted { phase: 'thinking' }

3. Worker creates initial AI response item
   └─→ timelineItemCreated (AI message with empty parts)

4. Worker searches knowledge base
   └─→ aiAgentProcessingProgress { phase: 'searching-knowledge' }
   └─→ timelineItemPartUpdated (tool-knowledge-search part added, state: 'executing')

5. Knowledge search completes
   └─→ timelineItemPartUpdated (tool-knowledge-search part updated, state: 'completed')
   └─→ timelineItemPartUpdated (source-url parts added)

6. Worker generates response text
   └─→ aiAgentProcessingProgress { phase: 'generating' }
   └─→ timelineItemPartUpdated (text part added/updated)

7. Processing complete
   └─→ aiAgentProcessingCompleted { status: 'success' }
   └─→ timelineItemUpdated (final state)
```

### Client-Side Handling

```typescript
// In @packages/react or widget code

function useTimelineItemUpdates(conversationId: string) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [processingState, setProcessingState] = useState<ProcessingState | null>(null);

  useRealtimeEvent('timelineItemCreated', (event) => {
    if (event.conversationId === conversationId) {
      setItems(prev => [...prev, event.item]);
    }
  });

  useRealtimeEvent('timelineItemUpdated', (event) => {
    if (event.conversationId === conversationId) {
      setItems(prev => prev.map(item =>
        item.id === event.itemId
          ? { ...item, ...event.updates }
          : item
      ));
    }
  });

  useRealtimeEvent('aiAgentProcessingProgress', (event) => {
    if (event.conversationId === conversationId) {
      setProcessingState({
        phase: event.phase,
        itemId: event.timelineItemId,
        details: event.details,
      });
    }
  });

  useRealtimeEvent('aiAgentProcessingCompleted', (event) => {
    if (event.conversationId === conversationId) {
      setProcessingState(null);
    }
  });

  return { items, processingState };
}
```

### Sticking to AI SDK Patterns

The AI SDK doesn't have audience/filtering concepts in the types themselves. Types are pure data structures. **Filtering happens at the consumption layer.**

This is the right approach:
1. **Types**: Match AI SDK exactly, extend with optional metadata
2. **API Layer**: Filter based on audience before sending
3. **Client Layer**: Render what it receives

#### Cossistant Extensions via Metadata

AI SDK's `UIMessage` has an optional `metadata` field. We use this for Cossistant-specific data:

```typescript
// AI SDK compatible - metadata is the extension point
interface UIMessage<METADATA = unknown> {
  id: string;
  role: 'system' | 'user' | 'assistant';
  metadata?: METADATA;
  parts: UIMessagePart[];
}

// Cossistant metadata schema
export const cossistantMessageMetadataSchema = z.object({
  // Cossistant-specific fields
  conversationId: z.string(),
  organizationId: z.string(),
  visibility: z.enum(['public', 'private']),

  // Sender info (maps to AI SDK role)
  userId: z.string().nullable(),
  aiAgentId: z.string().nullable(),
  visitorId: z.string().nullable(),

  // Reply threading (future feature)
  replyToId: z.string().nullable().optional(),
});

type CossistantUIMessage = UIMessage<z.infer<typeof cossistantMessageMetadataSchema>>;
```

#### Part-Level Metadata for Visibility

AI SDK tool parts have `providerMetadata`. We use this for visibility:

```typescript
// AI SDK pattern - providerMetadata is the extension point
type ToolUIPart = {
  type: `tool-${string}`;
  toolCallId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  state: 'partial' | 'result' | 'error';
  providerMetadata?: Record<string, unknown>;
};

// Cossistant uses providerMetadata for visibility
{
  type: 'tool-knowledge-search',
  toolCallId: 'call_123',
  toolName: 'knowledge-search',
  input: { query: 'shipping policy' },
  state: 'result',
  output: [{ title: 'Shipping FAQ', ... }],
  providerMetadata: {
    cossistant: {
      visibility: 'private',  // Don't show to widget
    }
  }
}
```

### Filtering at the API Layer

The API decides what to send based on the consumer:

```typescript
// @packages/core/src/utils/filter-for-audience.ts

type Audience = 'dashboard' | 'widget';

export function filterMessageForAudience(
  message: CossistantUIMessage,
  audience: Audience
): CossistantUIMessage | null {
  // Widget can't see private messages
  if (audience === 'widget' && message.metadata?.visibility === 'private') {
    return null;
  }

  // Filter parts based on visibility
  const filteredParts = message.parts.filter(part => {
    const visibility = part.providerMetadata?.cossistant?.visibility ?? 'public';
    return audience === 'dashboard' || visibility === 'public';
  });

  return { ...message, parts: filteredParts };
}

// Used in API/WebSocket handlers
function getTimelineForWidget(conversationId: string) {
  const items = await getTimelineItems(conversationId);
  return items
    .map(item => filterMessageForAudience(item, 'widget'))
    .filter(Boolean);
}
```

### Progress Events: Using AI SDK's Data Streaming Pattern

AI SDK v6 has a concept of **transient data parts** - data sent to the client but not persisted in message history. This is perfect for progress updates:

```typescript
// AI SDK pattern: transient data parts for ephemeral state
writer.write({
  type: 'data-progress',
  data: { phase: 'searching', message: 'Looking up information...' },
  transient: true,  // Won't be added to message history
});
```

We adapt this for WebSocket:

```typescript
// Cossistant WebSocket event - follows AI SDK data part pattern
aiAgentProgress: baseRealtimeEvent.extend({
  conversationId: z.string(),
  aiAgentId: z.string(),
  timelineItemId: z.string().nullable(),

  // Follows AI SDK data part structure
  data: z.object({
    phase: z.string(),
    message: z.string(),
    toolName: z.string().optional(),
    toolCallId: z.string().optional(),
  }),

  // Transient = not persisted, just for live display
  transient: z.literal(true),
}),
```

### Custom Tool Definitions: AI SDK Compatible

AI SDK defines tools with a specific pattern. We follow it:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

// AI SDK tool definition pattern
const checkInventoryTool = tool({
  description: 'Check product inventory',
  parameters: z.object({
    productId: z.string(),
    quantity: z.number(),
  }),
  execute: async ({ productId, quantity }) => {
    // ... implementation
    return { available: 10, productId };
  },
});

// Cossistant extension: add metadata for visibility/progress
const checkInventoryToolWithMeta = {
  ...checkInventoryTool,
  // Cossistant-specific (not part of AI SDK, but doesn't break it)
  cossistant: {
    visibility: 'public',
    progressMessage: 'Checking availability...',
  },
};
```

### Widget vs Dashboard: Same Types, Different Filters

```
┌─────────────────────────────────────────────────────────────┐
│                        Database                              │
│  (Full UIMessage with all parts and metadata)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│  filterMessageForAudience(message, audience)                │
└─────────────────────────────────────────────────────────────┘
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │     Dashboard      │   │      Widget        │
        │  (all parts)       │   │  (public parts)    │
        │  (full metadata)   │   │  (filtered)        │
        └───────────────────┘   └───────────────────┘
```

### Summary: AI SDK Alignment

| Concept | AI SDK Pattern | Cossistant Usage |
|---------|---------------|------------------|
| Message structure | `UIMessage<METADATA>` | Use METADATA for visibility, IDs |
| Part extensions | `providerMetadata` | Store visibility, cossistant-specific data |
| Progress updates | Transient data parts | WebSocket events with `transient: true` |
| Tool definitions | `tool()` from 'ai' | Extend with `cossistant` metadata object |
| Filtering | Client-side in AI SDK | API-side based on audience |

This approach:
1. **100% AI SDK compatible** - Types match exactly
2. **Extensions don't break anything** - Uses metadata/providerMetadata
3. **Filtering is separate** - Not baked into types
4. **Developers familiar with AI SDK** - Same patterns work

---

## 1. Type System Redesign

### 1.1 Aligning with AI SDK v6 Types

We use AI SDK's exact type structure and extend via the designated extension points (`metadata`, `providerMetadata`).

```typescript
import { z } from "@hono/zod-openapi";
import type { UIMessage, UIMessagePart } from 'ai';

// ============================================================================
// AI SDK v6 PART STATES (use their exact values)
// ============================================================================

// Text/Reasoning state - AI SDK uses 'streaming' | 'done'
// For our job-based system, we interpret:
//   'streaming' = still being generated/processed
//   'done' = complete
export const textStateSchema = z.enum(["streaming", "done"]).default("done");

// ============================================================================
// TEXT PART (matches AI SDK exactly)
// ============================================================================
export const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  state: textStateSchema.optional(),
});

// ============================================================================
// REASONING PART (matches AI SDK exactly)
// ============================================================================
export const reasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
  state: textStateSchema.optional(),
  providerMetadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// TOOL PARTS (matches AI SDK v6 pattern)
// ============================================================================

// AI SDK v6 tool states:
//   'partial' - Input still streaming (we use for 'executing')
//   'result' - Tool completed successfully
//   'error' - Tool failed
export const toolStateSchema = z.enum([
  "partial",  // Tool is executing / input being processed
  "result",   // Tool completed with output
  "error"     // Tool failed
]);

// Base tool part (matches AI SDK v6 exactly + providerMetadata for extensions)
export const toolPartSchema = z.object({
  type: z.string().regex(/^tool-.+$/), // AI SDK pattern: tool-${toolName}
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.record(z.unknown()),
  output: z.unknown().optional(),
  state: toolStateSchema,
  errorText: z.string().optional(),

  // AI SDK extension point - we use for Cossistant-specific data
  providerMetadata: z.object({
    cossistant: z.object({
      visibility: z.enum(["public", "private"]).default("public"),
      progressMessage: z.string().optional(), // Custom progress text
    }).optional(),
  }).passthrough().optional(),
});

// Specific tool parts for type safety
export const knowledgeSearchToolPartSchema = z.object({
  type: z.literal("tool-knowledge-search"),
  toolCallId: z.string(),
  toolName: z.literal("knowledge-search"),
  input: z.object({
    query: z.string(),
    limit: z.number().optional(),
  }),
  output: z.array(z.object({
    knowledgeId: z.string(),
    title: z.string(),
    snippet: z.string(),
    score: z.number(),
  })).optional(),
  state: toolStateSchema,
  errorText: z.string().optional(),
  visibility: z.literal("private"), // Always private
});

export const escalateToolPartSchema = z.object({
  type: z.literal("tool-escalate"),
  toolCallId: z.string(),
  toolName: z.literal("escalate"),
  input: z.object({
    reason: z.string(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    assignToUserId: z.string().optional(),
  }),
  output: z.object({
    escalated: z.boolean(),
    assignedToUserId: z.string().optional(),
  }).optional(),
  state: toolStateSchema,
  errorText: z.string().optional(),
  visibility: z.literal("public"),
});

export const resolveToolPartSchema = z.object({
  type: z.literal("tool-resolve"),
  toolCallId: z.string(),
  toolName: z.literal("resolve"),
  input: z.object({
    reason: z.string().optional(),
  }),
  output: z.object({
    resolved: z.boolean(),
  }).optional(),
  state: toolStateSchema,
  errorText: z.string().optional(),
  visibility: z.literal("public"),
});

export const identifyToolPartSchema = z.object({
  type: z.literal("tool-identify"),
  toolCallId: z.string(),
  toolName: z.literal("identify"),
  input: z.object({
    fields: z.array(z.enum(["name", "email", "phone", "company"])),
    message: z.string().optional(),
  }),
  output: z.object({
    collected: z.record(z.string()).optional(),
    skipped: z.boolean().optional(),
  }).optional(),
  state: toolStateSchema,
  errorText: z.string().optional(),
  visibility: z.literal("public"),
});

// ============================================================================
// SOURCE PARTS (knowledge attribution)
// ============================================================================
export const sourceUrlPartSchema = z.object({
  type: z.literal("source-url"),
  sourceId: z.string(),
  url: z.string().url(),
  title: z.string().optional(),
  // Cossistant extension: link to knowledge entry
  knowledgeId: z.string().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
});

export const sourceDocumentPartSchema = z.object({
  type: z.literal("source-document"),
  sourceId: z.string(),
  mediaType: z.string(),
  title: z.string(),
  filename: z.string().optional(),
  // Cossistant extension
  knowledgeId: z.string().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
});

// ============================================================================
// STEP PART (multi-step boundary marker)
// ============================================================================
export const stepStartPartSchema = z.object({
  type: z.literal("step-start"),
  stepId: z.string().optional(),
  description: z.string().optional(),
});

// ============================================================================
// EXISTING PARTS (updated)
// ============================================================================
export const imagePartSchema = z.object({
  type: z.literal("image"),
  url: z.string(),
  mediaType: z.string(),
  fileName: z.string().optional(),
  size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const filePartSchema = z.object({
  type: z.literal("file"),
  url: z.string(),
  mediaType: z.string(),
  fileName: z.string().optional(),
  size: z.number().optional(),
});

export const eventPartSchema = z.object({
  type: z.literal("event"),
  eventType: z.enum([/* ... existing event types */]),
  actorUserId: z.string().nullable(),
  actorAiAgentId: z.string().nullable(),
  targetUserId: z.string().nullable(),
  targetAiAgentId: z.string().nullable(),
  message: z.string().nullable().optional(),
});

export const metadataPartSchema = z.object({
  type: z.literal("metadata"),
  source: z.enum(["email", "widget", "api"]),
});

// ============================================================================
// UNION OF ALL PARTS
// ============================================================================
export const timelineItemPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  reasoningPartSchema,
  toolPartSchema,
  knowledgeSearchToolPartSchema,
  escalateToolPartSchema,
  resolveToolPartSchema,
  identifyToolPartSchema,
  sourceUrlPartSchema,
  sourceDocumentPartSchema,
  stepStartPartSchema,
  imagePartSchema,
  filePartSchema,
  eventPartSchema,
  metadataPartSchema,
]);

export const timelineItemPartsSchema = z.array(timelineItemPartSchema);
```

### 1.2 Updated TimelineItem Schema

```typescript
export const timelineItemSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  organizationId: z.string(),

  // Visibility for the entire item (can have private items invisible to visitor)
  visibility: z.enum(["public", "private"]),

  // Type of timeline item
  type: z.enum(["message", "event", "identification"]),

  // Legacy text field (deprecated, use parts instead)
  text: z.string().nullable(),

  // Rich content parts (AI SDK compatible)
  parts: timelineItemPartsSchema,

  // Sender identification (maps to AI SDK role)
  userId: z.string().nullable(),      // role: 'user' (human agent)
  aiAgentId: z.string().nullable(),   // role: 'assistant'
  visitorId: z.string().nullable(),   // role: 'user' (visitor)

  // Optional metadata (AI SDK compatible)
  metadata: z.record(z.unknown()).optional(),

  // Timestamps
  createdAt: z.string(),
  deletedAt: z.string().nullable().optional(),

  // NEW: Reference to parent message (for reply threading)
  replyToId: z.string().nullable().optional(),

  // NEW: References to messages this is responding to
  inReplyToIds: z.array(z.string()).optional(),
});
```

---

## 2. Privacy & Trimming Strategy

### 2.1 Part-Level Visibility

Each part can have its own visibility setting:

```typescript
type PartVisibility = "public" | "private";

// Parts with visibility field
type VisiblePart = {
  visibility?: PartVisibility;
  // ... other fields
};
```

### 2.2 Privacy Filter Function

```typescript
// @packages/core/src/utils/privacy-filter.ts

export type PrivacyContext = {
  isVisitor: boolean;
  isTeamMember: boolean;
  isAiAgent: boolean;
};

export function filterTimelineItemForPrivacy(
  item: TimelineItem,
  context: PrivacyContext
): TimelineItem | null {
  // If visitor and item is private, hide entirely
  if (context.isVisitor && item.visibility === "private") {
    return null;
  }

  // Filter parts based on visibility
  const filteredParts = item.parts.filter(part => {
    if (!("visibility" in part)) return true;
    if (context.isVisitor && part.visibility === "private") return false;
    return true;
  });

  // Also sanitize tool parts for visitors
  const sanitizedParts = filteredParts.map(part => {
    if (context.isVisitor && part.type.startsWith("tool-")) {
      return sanitizeToolPartForVisitor(part);
    }
    return part;
  });

  return { ...item, parts: sanitizedParts };
}

function sanitizeToolPartForVisitor(part: ToolPart): ToolPart {
  // For knowledge-search, hide the raw results
  if (part.type === "tool-knowledge-search") {
    return {
      ...part,
      input: { query: "[hidden]" },
      output: undefined,
    };
  }
  return part;
}
```

### 2.3 Privacy Presets

```typescript
// Common privacy configurations
export const PrivacyPresets = {
  // Show everything to visitor (for transparent AI)
  TRANSPARENT: {
    showReasoning: true,
    showToolCalls: true,
    showSources: true,
  },

  // Hide internal workings (default for most cases)
  STANDARD: {
    showReasoning: false,
    showToolCalls: false, // Only show public tools like escalate/resolve
    showSources: true,
  },

  // Minimal disclosure
  MINIMAL: {
    showReasoning: false,
    showToolCalls: false,
    showSources: false,
  },
} as const;
```

---

## 3. AI SDK Integration

> **Note:** React primitives for rendering parts (PartsRenderer, ToolPart, ReasoningPart, etc.) are planned for a future iteration. See `NOTES_FOR_NEXT.md` for detailed component plans.

### 3.1 Package Dependencies

```jsonc
// @packages/core/package.json
{
  "dependencies": {
    "ai": "^6.0.0"  // Add AI SDK
  }
}
```

### 3.2 Conversion Utilities

```typescript
// @packages/core/src/utils/ai-sdk-compat.ts

import type { UIMessage, UIMessagePart } from "ai";
import type { TimelineItem, TimelineItemPart } from "@cossistant/types";

/**
 * Convert Cossistant TimelineItem to AI SDK UIMessage format
 */
export function toUIMessage(item: TimelineItem): UIMessage {
  return {
    id: item.id,
    role: getRole(item),
    metadata: item.metadata,
    parts: item.parts.map(toUIMessagePart),
  };
}

/**
 * Convert AI SDK UIMessage to Cossistant TimelineItem format
 */
export function fromUIMessage(
  message: UIMessage,
  context: {
    conversationId: string;
    organizationId: string;
    aiAgentId?: string;
    userId?: string;
    visitorId?: string;
  }
): Omit<TimelineItem, "id" | "createdAt"> {
  return {
    conversationId: context.conversationId,
    organizationId: context.organizationId,
    visibility: "public",
    type: "message",
    text: extractTextFromParts(message.parts),
    parts: message.parts.map(fromUIMessagePart),
    userId: context.userId ?? null,
    aiAgentId: context.aiAgentId ?? null,
    visitorId: context.visitorId ?? null,
    metadata: message.metadata,
    deletedAt: null,
  };
}

function getRole(item: TimelineItem): "user" | "assistant" | "system" {
  if (item.aiAgentId) return "assistant";
  return "user"; // Both visitor and human agents are "user" role
}

function toUIMessagePart(part: TimelineItemPart): UIMessagePart {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text, state: part.state };
    case "reasoning":
      return { type: "reasoning", text: part.text, state: part.state };
    // ... handle all part types
  }
}
```

---

## 4. Database Schema Updates

### 4.1 New Columns (Future)

> **Note:** These schema changes are optional and can be added later when needed.

```sql
-- Optional: Add reply reference for "reply to specific message" feature
ALTER TABLE timeline_items
ADD COLUMN reply_to_id TEXT REFERENCES timeline_items(id);

-- Create index for reply lookups
CREATE INDEX idx_timeline_items_reply_to ON timeline_items(reply_to_id);
```

The existing `parts` JSONB column already supports the new part types - no schema change required for AI SDK compatibility.

### 4.2 Parts Column Update

The `parts` column already stores JSONB. The schema change is backward compatible:
- Old parts without `visibility` field default to `"public"`
- Old parts without `state` field are treated as `"done"`

---

## 5. Implementation Roadmap

> **Scope:** This iteration focuses on types, WebSocket events, and API layer. React primitives are deferred to next iteration (see `NOTES_FOR_NEXT.md`).

### Phase 1: Type Foundation
- [ ] Update `@packages/types/src/api/timeline-item.ts` with new part schemas (AI SDK compatible)
- [ ] Add new WebSocket events to `@packages/types/src/realtime-events.ts`
- [ ] Add `ai` package dependency to `@packages/core`
- [ ] Create AI SDK conversion utilities (`toUIMessage`, `fromUIMessage`)
- [ ] Add Cossistant metadata schema for UIMessage extension

### Phase 2: Privacy & Filtering
- [ ] Create `filterMessageForAudience()` utility in `@packages/core`
- [ ] Implement part-level visibility filtering
- [ ] Add privacy presets (TRANSPARENT, STANDARD, MINIMAL)
- [ ] Update API endpoints to filter based on consumer (widget vs dashboard)

### Phase 3: Workers & Events
- [ ] Update AI agent worker to emit new part types
- [ ] Implement WebSocket event emission for progress updates
- [ ] Create migration script for existing timeline items (update parts structure)
- [ ] (Future) Add `reply_to_id` column when reply feature is needed

### Phase 4: Testing & Validation
- [ ] Unit tests for new type schemas
- [ ] Integration tests for privacy filtering
- [ ] Test WebSocket event flow end-to-end
- [ ] Validate AI SDK type compatibility

### Future Iteration (see NOTES_FOR_NEXT.md)
- React primitives for rendering parts
- PartsRenderer component
- Tool-specific UI components
- AI activity indicator component

---

## 6. Breaking Changes & Migration

### 6.1 Breaking Changes

1. **`text` field deprecated**: Use `parts` array with `TextPart` instead
2. **`tool` field removed**: Use `ToolPart` in `parts` array
3. **New required fields**: `parts` array is now required (can be empty)
4. **`fileName` renamed to `filename`**: In `file` and `image` parts, the field was renamed from `fileName` (camelCase) to `filename` (lowercase) to align with AI SDK conventions. The conversion utilities (`toUIMessage`, `fromUIMessage`) handle both for backward compatibility with existing data.

### 6.2 Migration Script

```typescript
// scripts/migrate-timeline-items.ts

async function migrateTimelineItems() {
  const items = await db.query.timelineItems.findMany({
    where: isNull(timelineItems.parts), // Old items without parts
  });

  for (const item of items) {
    const parts: TimelineItemPart[] = [];

    // Migrate text to text part
    if (item.text) {
      parts.push({
        type: "text",
        text: item.text,
        state: "done",
      });
    }

    // Migrate tool field to tool part
    if (item.tool) {
      parts.push({
        type: `tool-${item.tool}`,
        toolCallId: ulid(),
        toolName: item.tool,
        input: {},
        state: "output-available",
        visibility: "public",
      });
    }

    await db.update(timelineItems)
      .set({ parts })
      .where(eq(timelineItems.id, item.id));
  }
}
```

---

## 7. Example Usage

### 7.1 Creating a Timeline Item with Tool Call (Worker)

```typescript
// In AI agent worker - using AI SDK compatible types
import { ulid } from 'ulid';

const timelineItem = await createTimelineItem({
  conversationId,
  organizationId,
  type: "message",
  aiAgentId: agent.id,
  metadata: {
    conversationId,
    organizationId,
    visibility: "public",
    aiAgentId: agent.id,
    userId: null,
    visitorId: null,
  },
  parts: [
    {
      type: "text",
      text: "I'll look that up for you...",
      state: "done",
    },
    {
      type: "tool-knowledge-search",
      toolCallId: ulid(),
      toolName: "knowledge-search",
      input: { query: "shipping policy" },
      state: "partial", // AI SDK state: executing
      providerMetadata: {
        cossistant: {
          visibility: "private",
          progressMessage: "Searching knowledge base...",
        }
      }
    },
  ],
});

// Emit WebSocket event for progress
await emitRealtimeEvent('aiAgentProgress', {
  conversationId,
  aiAgentId: agent.id,
  timelineItemId: timelineItem.id,
  data: {
    phase: 'searching-knowledge',
    message: 'Searching knowledge base...',
    toolName: 'knowledge-search',
    toolCallId: timelineItem.parts[1].toolCallId,
  },
  transient: true,
});

// After tool execution, update the part
await updateTimelineItemPart(timelineItem.id, 1, {
  state: "result", // AI SDK state: completed
  output: [
    { knowledgeId: "...", title: "Shipping FAQ", snippet: "...", score: 0.95 }
  ],
});

// Add source attribution
await appendTimelineItemPart(timelineItem.id, {
  type: "source-url",
  sourceId: ulid(),
  url: "https://example.com/faq/shipping",
  title: "Shipping FAQ",
  providerMetadata: {
    cossistant: {
      knowledgeId: "...",
      visibility: "public",
    }
  }
});
```

### 7.2 Filtering for Widget vs Dashboard (API Layer)

```typescript
// In API endpoint
import { filterMessageForAudience } from '@cossistant/core';

// Widget endpoint - filters private parts
app.get('/api/widget/conversations/:id/timeline', async (req, res) => {
  const items = await getTimelineItems(req.params.id);
  const filtered = items
    .map(item => filterMessageForAudience(item, 'widget'))
    .filter(Boolean);
  return res.json({ items: filtered });
});

// Dashboard endpoint - returns all parts
app.get('/api/dashboard/conversations/:id/timeline', async (req, res) => {
  const items = await getTimelineItems(req.params.id);
  const filtered = items
    .map(item => filterMessageForAudience(item, 'dashboard'))
    .filter(Boolean);
  return res.json({ items: filtered });
});
```

### 7.3 Converting to/from AI SDK Format

```typescript
import { toUIMessage, fromUIMessage } from '@cossistant/core';
import type { UIMessage } from 'ai';

// Convert Cossistant TimelineItem to AI SDK UIMessage
const uiMessage: UIMessage = toUIMessage(timelineItem);
// Result: { id, role: 'assistant', metadata: {...}, parts: [...] }

// Convert AI SDK UIMessage back to Cossistant format
const cossistantItem = fromUIMessage(uiMessage, {
  conversationId: '...',
  organizationId: '...',
  aiAgentId: '...',
});
```

---

## 8. Open Questions

1. **Streaming architecture**: Should we use WebSocket for real-time part updates or SSE?
2. **Part ordering**: Should parts maintain insertion order or be grouped by type?
3. **Tool approval flow**: Should some tools require human approval before execution?
4. **Source deduplication**: How to handle multiple messages citing the same source?

---

## 9. Success Metrics

1. All AI SDK v6 part types are supported
2. Developers can use AI SDK UIMessage types seamlessly
3. Privacy filtering works correctly for widget consumers
4. Dashboard shows full transparency into AI agent behavior
5. No breaking changes in widget rendering for existing integrations
