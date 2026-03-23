# API Roadmap

This document reflects the current v1 core API and the next deferred pieces.

## Constructor

```ts
const memory = new Memory({
	db,
	models: {
		embed,
		summarize,
	},
	now,
});
```

Constructor rules:

- `db` must be a Drizzle PostgreSQL database instance with `execute`, `select`, `insert`, `update`, `delete`, and `transaction`
- `models.embed` must be an AI SDK embedding model instance
- `models.summarize` must be an AI SDK language model instance
- `now` is optional and exists for deterministic tests

## Implemented Methods

### `remember(input)`

Purpose:

- append a new durable memory record

Current behavior:

- validates input
- normalizes metadata
- applies defaults
- optionally generates an embedding
- inserts into `memory_records`
- returns `{ id, createdAt }`

Notes:

- ids are opaque strings
- the database must generate the `id`
- the package does not mutate older rows

### `context(input)`

Purpose:

- return the most relevant memory for the current situation

Current behavior:

- validates `where`, `text`, `limit`, and `includeSummary`
- narrows candidates with metadata filters first
- optionally embeds `text`
- loads structural candidates
- optionally loads semantic candidates
- ranks by semantic relevance, priority, and freshness
- deduplicates near-identical results conservatively
- returns prompt-ready items
- optionally returns a stored summary row as `summary`

Notes:

- `includeSummary` does not generate a summary
- summaries are only surfaced if a matching summary row already exists

### `forget(input)`

Purpose:

- delete one memory item or a filtered set of items

Current behavior:

- supports delete by `id`
- supports delete by `where`
- returns `{ deletedCount }`

## Implemented AI SDK Tools

### `createMemoryTool(options)`

Purpose:

- expose two prebound AI SDK tools backed by the `Memory` class

Current behavior:

- returns `{ remember, recallMemory }`
- validates bound write metadata and bound recall scope at construction time
- keeps raw `metadata` and raw `where` out of the model-visible input schema

### `remember`

Purpose:

- let an agent store one durable memory inside a pre-approved metadata scope

Current behavior:

- accepts `content` and optional `priority`
- always writes with fixed metadata from `options.remember.metadata`
- returns a structured tool result with `id` and `createdAt`

### `recallMemory`

Purpose:

- let an agent retrieve relevant memory inside a pre-approved recall scope

Current behavior:

- accepts `text`, `limit`, and `includeSummary`
- always reads with fixed `where` from `options.recall.where`
- applies configured recall defaults when omitted
- returns prompt-ready `items` and optional `summary`

## Deferred Runtime API

### `summarize(input)`

Still planned, but not implemented yet.

Intended behavior:

- gather matching items
- summarize them with `models.summarize`
- optionally store a summary row back into `memory_records`

### Agent Delete Tool

Not planned for the current pass.

`forget()` remains available on the class API, but no delete tool is exposed to
agents yet.

## Query DSL

The supported filter language stays intentionally small:

```ts
{ userId: "user_123" }

{ and: [{ appId: "app_123" }, { userId: "user_123" }] }

{
	and: [
		{ appId: "app_123" },
		{ or: [{ conversationId: "conv_456" }, { topic: "billing" }] },
	],
}
```

Supported now:

- equality
- `and`
- `or`

Out of scope:

- range operators
- `contains`
- nested JSON traversal
- arbitrary SQL
- regex
- `not`
