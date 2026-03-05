# Progress: AI Agent Pipeline Simplification

## Session 1 — 2026-03-05

### Audit completed
- Read `apps/api/src/ai-agent/pipeline/index.ts` end-to-end.
- Mapped stage flow and side effects (events, tracing, typing, AI credit metering, fallback send path).
- Reviewed `index.test.ts` to establish behavior parity constraints before refactoring.

### Next
- Refactor orchestration into smaller helpers while preserving existing tests.

# Progress: Avatar Stack Race Condition

## Session 1 — 2026-02-12

### Attempt 1: isMountedRef fix — FAILED
- Fixed useClientQuery's isMountedRef not resetting on remount
- Issue: didn't affect the store-based data path

### Attempt 2: Stable subscribe — FAILED
- Stabilized subscribe/getSnapshot in useStoreSelector and support-store
- Issue: useSyncExternalStore handles unstable refs correctly

### Starting Phase 1: Deep investigation
- Searching for all websiteStore mutations
- Checking realtime/identification flows
- Looking for secondary fetch paths
