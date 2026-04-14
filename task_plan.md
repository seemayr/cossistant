# Repo Check And Build Recovery

## Goal
Get this monorepo back to a clean verification state by making `bun fix`, `bun run check-types`, and package build commands pass without reverting unrelated user work already in the dirty tree.

## Current Phase
Phase 5

## Phases
- [ ] Phase 1: Baseline and constraints
  - Capture repo scripts, current planning context, and dirty worktree constraints
  - Confirm the command sequence we need to make green
  - **Status:** complete
- [ ] Phase 2: Lint and formatting fixes
  - Run `bun fix`
  - Resolve all reported issues
  - **Status:** complete
- [ ] Phase 3: Typecheck fixes
  - Run `bun run check-types`
  - Resolve source or config issues until it passes
  - **Status:** complete
- [ ] Phase 4: Build verification
  - Run repo/package build commands
  - Resolve build failures
  - **Status:** complete
- [ ] Phase 5: Final verification and handoff
  - Re-run fixed commands
  - Record results and remaining risks
  - **Status:** complete

## Key Questions
1. Which failures are current, reproducible, and relevant to this task?
2. Which touched files are ours to modify versus unrelated pre-existing changes?
3. What is the smallest safe set of edits needed to restore green checks?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Treat the repo as intentionally dirty | Avoid reverting or disturbing unrelated user work |
| Use the actual root scripts first | Fixes should be driven by real command output, not assumptions |
| Verify builds after lint and type checks | Build issues can be downstream of earlier failures |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `bun fix` exited with remaining Ultracite diagnostics after auto-fixing 72 files | 1 | Manually patching the reported files, then rerunning with a higher diagnostic limit |
| `bun fix` second pass still failed on 2 residual issues | 2 | Removed the stale file-level suppression and fixed the test helper parameter order; third pass succeeded |
| Root `check-types` failed in `apps/web` | 1 | Fixed dashboard/test fixture typing, annotated fake support controller helpers, and cleared stale `apps/web/.next/types` artifacts |
| None in build verification | 1 | Root `bun run build` completed successfully; only non-blocking warnings remained |

## Notes
- Existing repo changes are extensive and mostly unrelated to this task.
- Only edit files required to make the requested checks and builds pass.
- Build warnings remain for missing VAPID env vars in `apps/web` and a Turbopack NFT trace warning in `apps/web/next.config.mjs`, but they did not block the build.
