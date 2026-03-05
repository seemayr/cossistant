# Task: Simplify AI Agent Pipeline (`apps/api/src/ai-agent/pipeline/index.ts`)

## Goal
Reduce complexity in pipeline orchestration while preserving behavior and feature parity.

## Status: PHASE 1 — IN PROGRESS

## Phases

### Phase 1: Audit behavior and test coverage — IN PROGRESS
- [x] Read current pipeline implementation end-to-end
- [x] Inventory existing pipeline tests and asserted behaviors
- [ ] Identify safe extraction/simplification boundaries

### Phase 2: Refactor for clarity and maintainability
- [ ] Extract repeated control-flow helpers (skip/emit/fallback/metrics)
- [ ] Reduce in-function closure sprawl and unused state
- [ ] Keep external API and stage ordering unchanged

### Phase 3: Verify feature parity
- [ ] Run targeted pipeline tests
- [ ] Fix any regression introduced by refactor
- [ ] Summarize changes and remaining risks

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| None yet | 0 | N/A |

# Task: Fix Avatar Stack Race Condition (Widget Home Page)

## Goal
Fix intermittent issue where human agent avatars don't show in the AvatarStack on the widget home page.

## Status: PHASE 1 — IN PROGRESS

## What We Already Tried (Did NOT Fix)
1. Fixed `isMountedRef` reset in `useClientQuery` (StrictMode bug)
2. Stabilized `subscribe` in `useStoreSelector` (useCallback)
3. Stabilized `subscribe` in `support-store.ts` (module-level)

## Phases

### Phase 1: Search for ALL mutations to websiteStore — IN PROGRESS
- [ ] Grep every call to `setWebsite`, `setLoading`, `setError`, `reset` on websiteStore
- [ ] Grep every call to `fetchWebsite` or `getWebsite`
- [ ] Check if realtime/websocket events ever touch the website store
- [ ] Check if identification flow re-fetches or overwrites website data

### Phase 2: Trace widget mount lifecycle & conditional rendering
- [ ] How does Content component show/hide when widget opens/closes?
- [ ] Does the widget content unmount when closed? (remount = lose state?)
- [ ] Are there intermediate renders where website is truthy but agents are empty?
- [ ] Check the SupportRealtimeProvider and identification provider effects

### Phase 3: Server-side investigation
- [ ] Look at /websites API handler
- [ ] Can availableHumanAgents be empty depending on when the call is made?
- [ ] Is there a difference between initial load and subsequent loads?

### Phase 4: Implement fix based on findings

## Dead Ends
| # | What | Why It Failed |
|---|------|---------------|
| 1 | isMountedRef reset | Store-based path works independently |
| 2 | Stable subscribe in useStoreSelector | useSyncExternalStore handles unstable refs |
| 3 | Stable subscribe in support-store | Same as above |
