# Testing

The current test strategy focuses on fast, deterministic coverage for the core
runtime behavior.

## Covered Today

### Public API tests

`src/memory.test.ts` covers:

- constructor acceptance and rejection paths
- `remember()` defaults and embedding flow
- `context()` ranking, semantic merge, and stored summary behavior
- `forget()` by id and by filter

### AI SDK tool tests

`src/memory-tool.test.ts` covers:

- `createMemoryTool(...)` returning `remember` and `recallMemory`
- constructor-time guardrails for bound metadata and bound recall scope
- strict tool input schemas
- prebound write/read behavior
- structured success and error result shapes

### Cossistant wrapper tests

`apps/api/src/ai-pipeline/shared/tools/memory.test.ts` covers:

- visitor, conversation, and website scope binding
- wrapper alias names
- recall default propagation
- no tool-catalog or capability-UI dependency

### Validation tests

`src/validation.test.ts` covers:

- empty content rejection
- nested metadata rejection
- invalid priority rejection
- invalid limit rejection
- malformed logical filters
- malformed forget inputs

### Filter tests

`src/filters.test.ts` covers:

- equality compilation
- nested `and`
- nested `or`
- mixed logical compilation
- numeric, boolean, and null metadata values
- summary include/exclude conditions
- opaque string id deletes

### Scoring tests

`src/scoring.test.ts` covers:

- higher priority beating recent low-priority notes when appropriate
- freshness boosting recent notes over slightly stronger stale ones
- semantic score only lifting candidates when similarity exists
- conservative dedupe behavior

## Deferred: DB-Backed Integration Suite

The first pass intentionally stops short of running Postgres-backed integration
tests.

When that suite is added, it should:

- run against real PostgreSQL + pgvector
- validate the fixed `memory_records` contract
- cover ULID-backed and UUID-backed ids
- live behind a dedicated Docker Compose setup for the memory package

That last point matters. The memory package should not depend on the repo-wide
development stack just to verify its own DB behavior.
