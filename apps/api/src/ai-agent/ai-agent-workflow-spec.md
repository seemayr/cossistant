# AI Agent Workflow MVP Spec (Proactive FIFO)

Status: Proposed (spec-only)  
Scope: Define the MVP workflow contract before implementation

## 0) Brief Summary

This spec defines a rebuilt AI agent MVP workflow focused on:

- strict per-conversation FIFO trigger processing,
- one unified agentic workflow for visitor and team messages,
- proactive behavior to reduce perceived wait,
- predictable decision and retry semantics.

This document is intentionally implementation-ready and decision-complete.

### Incremental Delivery Strategy

Implementation must be staged as large, testable chunks. Each stage adds one
layer of complexity and has a hard verification gate before moving forward.
The sequence is strict:

1. FIFO correctness,
2. trigger/intake policy,
3. deterministic decisioning,
4. minimal agentic completion,
5. full finish actions,
6. proactive responsiveness,
7. retry/failure semantics,
8. async followup and observability hardening.

---

## 1) MVP Goals / Non-Goals

### Goals

1. Keep orchestration simple and deterministic.
2. Remove dead-end workflow branches.
3. Process every trigger in FIFO order for each conversation.
4. Prioritize fast response path with parallel pre-generation work.
5. Define explicit retry and failure behavior.
6. Preserve external contracts where possible.

### Non-Goals

1. Broad consumer-facing contract breaks.
2. Prompt studio removal or redesign in MVP.
3. New major features beyond current finish actions.

---

## 2) Canonical Workflow Contract (Single Source of Truth)

### 2.1 Trigger Lifecycle

Each trigger follows:

`queued -> running -> completed | skipped | error`

### 2.2 Ordering and Exclusivity

1. Queue ordering key is `(messageCreatedAt, messageId)`.
2. A conversation-level lock guarantees only one active drain loop per conversation.
3. Every queued trigger is processed (no backlog coalescing in MVP).
4. Cursor progression is monotonic and only moves forward.

### 2.3 Source of Truth

1. Redis queue state and DB cursor remain authoritative for trigger ordering/recovery.
2. BullMQ wake jobs are orchestration signals, not canonical trigger state.

### 2.4 Drain Loop Invariants

1. If queue is non-empty at loop end, a runnable wake must exist or wake-needed must be marked.
2. A processed trigger must either:
   - be marked processed and removed from queue, or
   - remain queued for retry by explicit retry policy.

---

## 3) Trigger and Participation Policy

### 3.1 Trigger Sources

MVP triggers are:

1. Visitor-authored messages.
2. Human team-authored messages.

AI-authored messages do not trigger runs.

### 3.2 Unified Agentic Workflow

All trigger sources run through one workflow (same intake, decision, generation, execution, followup path).  
There is no separate chatbot workflow for visitors.

### 3.3 Sender x Visibility Participation Matrix

| Sender | Visibility | Evaluate? | Default Mode | Public Reply Allowed |
|---|---|---:|---|---:|
| visitor | public | yes | respond_to_visitor or background_only | yes |
| visitor | private (defensive) | yes | background_only | no |
| human_team | public | yes | respond_to_command or background_only | yes |
| human_team | private | yes | respond_to_command or background_only | yes (when command requires visitor update) |
| ai_agent | any | no (skip) | background_only | no |

Private content constraints are always enforced: no private leakage to visitors.

---

## 4) Proactive Responsiveness Contract

### 4.1 Best-Effort Fast Path

Before generation, workflow should parallelize independent tasks where safe:

1. intake reads,
2. decision policy/prompt bundle resolution,
3. guard checks and lightweight context fetches.

No hard external SLA is set; objective is minimum practical latency.

### 4.2 Interim Message for Slow Visitor-Facing Runs

For visitor-facing runs, if no public message has been sent and generation is slow, send one early interim acknowledgement and continue.

- Interim is optional per run: max 1 interim public message.
- Interim is non-terminal by definition.
- Interim should be short and neutral (for example: "Got it - checking this now.").

Recommended default soft threshold:

- `AI_AGENT_INTERIM_SOFT_THRESHOLD_MS = 3000` (configurable)

This is a soft control, not an SLA.

### 4.3 Persistent Typing Signal

Typing must remain active while generation retries are in progress for visitor-facing runs, and stop only when:

1. a terminal public send is done, or
2. run fully exits and cleanup completes.

### 4.4 Multi-Message Support

Multiple public messages are allowed in one run.  
Each public send must be classified as `interim` or `terminal`.

---

## 5) Decisioning Contract

### 5.1 Strategy

1. Deterministic rules first.
2. LLM tie-break only for ambiguous cases.

### 5.2 Deterministic Precedence Order

Evaluate in this strict order:

1. Missing/invalid trigger -> `shouldAct=false`, `background_only`.
2. AI paused -> `shouldAct=false`, `background_only`.
3. AI-authored trigger -> `shouldAct=false`, `background_only`.
4. Hard security/visibility constraints -> enforce private-safe behavior.
5. Explicit AI mention/tag or clear command -> `shouldAct=true`, command mode.
6. Deterministic obvious participation cases (clear visitor need, obvious no-op ack).
7. Ambiguous case -> smart decision model tie-break.
8. Smart decision model unavailable/fails:
   - visitor public trigger: default to act conservatively (`respond_to_visitor`),
   - team trigger: default to observe (`background_only`).

### 5.3 Decision Output Contract

Decision must produce:

1. `shouldAct` boolean,
2. mode (`respond_to_visitor` | `respond_to_command` | `background_only`),
3. reasoning string for observability,
4. optional command payload for team-driven runs.

---

## 6) Action Contract (MVP Finish Outcomes)

### 6.1 Finish Actions (unchanged)

MVP keeps:

- `respond`
- `escalate`
- `resolve`
- `mark_spam`
- `skip`

### 6.2 Messaging Classification

Public sends must carry internal classification:

- `interim`: early acknowledgement, non-terminal.
- `terminal`: final visitor-facing response for this trigger run.

### 6.3 Terminal Completion Semantics

1. A successful visitor-facing `respond`/`escalate`/`resolve` run should end with at least one terminal public send unless the run fails and enters silent-drop path.
2. `skip` and `mark_spam` may complete with zero public sends.

### 6.4 Async Followup Scope

Non-core analysis updates (title, sentiment, priority, category) are moved out of response-critical path into async followup jobs.

---

## 7) Retry / Failure Contract

### 7.1 Generation Retry Budget

- In-run generation retry budget: `3` attempts.
- Retry-eligible failures include transient model/network/timeouts/tool-loop failures.

### 7.2 Retry Behavior

1. Retries are silent (no dedicated retry notices).
2. Typing signal remains active during retry loop for visitor-facing runs.
3. Interim messages do not terminate the run and do not disable retries.

### 7.3 Retryability Rule

`retryable` is true when no terminal public message has been sent.  
`interim` public sends are excluded from non-retryable determination.

### 7.4 Exhaustion Behavior (Chosen Rule)

After retry budget is exhausted, run may end without a final visitor message (silent drop path).  
This is an accepted MVP tradeoff.

### 7.5 Worker-Level Policy

Preserve existing worker retry/drop framework as much as possible:

1. Worker applies existing failure threshold logic.
2. Queue mutation and processed-marker logic remain unchanged externally.

---

## 8) Observability and Invariants

### 8.1 External Contract Preservation

Keep existing external event contracts stable:

1. workflow lifecycle event names/payload shapes,
2. decision event names/payload shapes,
3. queue wake payload shape and job semantics.

### 8.2 Required MVP Metrics

Track at minimum:

1. `ai_queue_delay_ms` (trigger enqueue -> run start),
2. `ai_interim_message_rate` (runs with interim / visitor-facing runs),
3. `ai_generation_retry_count`,
4. `ai_drop_after_retry_exhaustion_count`,
5. `ai_fifo_backlog_depth` per conversation.

### 8.3 Core Invariants

1. FIFO ordering is preserved per conversation.
2. Duplicate trigger delivery does not produce duplicate visitor-visible terminal messages.
3. Cursor never moves backward.
4. Exactly one finish action per successful run.
5. Typing cleanup always executes in finalization.

---

## 9) Important API / Interface / Type Notes

### 9.1 Preserve External Contracts

No consumer-facing contract breaks are targeted for MVP in:

1. queue wake payloads,
2. realtime workflow/decision events,
3. finish action names.

### 9.2 Internal Semantic Addition

Introduce internal public-send classification:

- `interim` vs `terminal`

This classification updates retryability evaluation so "public message sent" is not automatically non-retryable.

### 9.3 Pipeline Result Semantics

`retryable` must reflect terminal-send state:

1. no terminal public send -> retryable true,
2. terminal public send present -> retryable false.

---

## 10) Acceptance Test Scenarios (Spec-Level)

1. **Visitor question -> fast path**
   - Expected: responds in normal flow with terminal action.

2. **Slow run -> interim then final**
   - Expected: one interim public send, later terminal public send, run completes.

3. **Transient generation failure -> retries**
   - Expected: up to 3 retries with typing kept active.

4. **Retry exhaustion**
   - Expected: silent drop path, dashboard/error telemetry increments.

5. **Visitor burst N messages**
   - Expected: every trigger processed in strict FIFO, no coalescing.

6. **Team public/private messages**
   - Expected: same workflow evaluates both, visibility rules enforced.

7. **Duplicate delivery**
   - Expected: idempotent behavior, no duplicate terminal visitor message.

8. **Lock loss and recovery**
   - Expected: wake recovery + cursor consistency preserved.

---

## 11) Explicit Assumptions and Defaults

1. Spec path is fixed to:
   - `/Users/anthonyriera/code/cossistant-monorepo/apps/api/src/ai-agent/ai-agent-workflow-spec.md`
2. No hard numeric first-response SLA is committed.
3. Slow-run interim behavior applies to visitor-facing runs.
4. Generation retry budget is 3.
5. Priority resolution chosen for MVP:
   - silent drop after retry exhaustion (accepted tradeoff vs ideal no-hang behavior).

---

## 12) Known Tradeoff (Explicitly Accepted)

This MVP prioritizes deterministic FIFO and stable contracts, but silent drop after retry exhaustion can still leave some visitor turns without a final answer.  
This is intentionally documented so future iterations can tighten no-hang guarantees without ambiguity.

---

## 13) Incremental Delivery Steps (Implementation Order)

This section is the execution checklist and must be used as the build order.
Every step requires:

1. code changes scoped to that step only,
2. spec refinement pass for the listed sections,
3. passing test gate before step completion.

### Step 1 - FIFO Engine Baseline (No AI Behavior Complexity)

**Layer added**

- Strict per-conversation FIFO correctness only.

**Work scope**

- Queue drain ordering.
- Conversation lock behavior.
- Cursor forward-only updates.
- Wake recovery invariants.

**Spec refinement target**

- Lock down Sections 2 and 8 as runtime invariants and state transitions.

**Public API/interface impact**

- None (contract-preserving).

**Test gate**

- Ordered processing by `(createdAt, messageId)`.
- Single active worker per conversation.
- Lock-loss recovery.
- Queue non-empty end-invariant repair.

**Exit criteria**

- FIFO remains deterministic under restart, stall, and lock-miss conditions.

### Step 2 - Intake + Trigger Policy Foundation

**Layer added**

- Trigger eligibility and unified participation entrypoint.

**Work scope**

- Valid trigger filtering.
- Sender/visibility normalization.
- Unified visitor+team path routing.
- AI-authored trigger skip.

**Spec refinement target**

- Finalize Section 3 sender/visibility matrix and input normalization assumptions.

**Public API/interface impact**

- None externally; internal intake contract becomes explicit.

**Test gate**

- Visitor/public triggers accepted.
- Team/public triggers accepted.
- Team/private triggers accepted.
- AI-authored triggers ignored.
- Invalid/missing triggers skip safely.

**Exit criteria**

- All trigger classes reach deterministic outcomes before any model call.

### Step 3 - Deterministic Decision Engine (Rules-First, No LLM Tie-Break Yet)

**Layer added**

- Predictable decision precedence without ambiguity handling.

**Work scope**

- Precedence chain: paused, invalid, security, visibility, tag, command, default.
- Mode selection.
- Decision reason contract.

**Spec refinement target**

- Finalize Section 5 precedence order and decision output semantics.

**Public API/interface impact**

- Decision event payload unchanged; internal decision resolution is stricter.

**Test gate**

- Matrix tests by sender x visibility x pause x explicit tag/command.

**Exit criteria**

- Zero ambiguous branches in deterministic path and explainable decision reasons.

### Step 4 - Minimal Agentic Turn Completion (Respond/Skip Path)

**Layer added**

- First true agentic response loop with terminal completion guarantee.

**Work scope**

- Tools-only generation path for minimal outcomes: `respond` and `skip`.
- Finish-action enforcement.
- Dead-end prevention.

**Spec refinement target**

- Clarify Section 6 terminal semantics and minimal completion guarantees.

**Public API/interface impact**

- None external; internal "must finish with action" rule hardened.

**Test gate**

- Visitor receives terminal response on normal path.
- Action is always captured.
- No orphan generation result without finish action.

**Exit criteria**

- Agent completes turns reliably without fallback chaos or dead ends.

### Step 5 - Full Finish Actions + Execution Side Effects

**Layer added**

- Full action capability parity for MVP:
  `respond`, `escalate`, `resolve`, `mark_spam`, `skip`.

**Work scope**

- Execution mapping for all finish actions.
- Idempotent status mutation paths.
- Escalation behavior consistency.

**Spec refinement target**

- Complete Section 6 action semantics for each finish outcome.

**Public API/interface impact**

- Finish action names preserved exactly.

**Test gate**

- End-to-end tests for each finish action with idempotency and expected state transitions.

**Exit criteria**

- Full action set behaves predictably with no contract breaks.

### Step 6 - Proactive Responsiveness Layer (Interim + Typing Persistence)

**Layer added**

- Visitor-perceived responsiveness improvements.

**Work scope**

- Slow-run interim public acknowledgement.
- Persistent typing through active processing.
- Multi-message lifecycle rules.

**Spec refinement target**

- Finalize Section 4 and Section 9 interim/terminal semantics.

**Public API/interface impact**

- None external; internal message classification introduced.

**Test gate**

- Slow-run sends interim once.
- Typing persists during in-flight processing.
- Terminal reply still arrives on success path.

**Exit criteria**

- Long-running runs feel active and not stalled.

### Step 7 - Retry/Failure Semantics Upgrade (Generation Retries + Interim Exception)

**Layer added**

- Retry model aligned to proactive semantics.

**Work scope**

- Generation retry budget of 3.
- Silent retries.
- Retryability based on terminal-send presence (interim excluded).
- Exhaustion handling.

**Spec refinement target**

- Lock Section 7 and Section 9 retryability semantics (`interim` vs `terminal`).

**Public API/interface impact**

- External payloads preserved; internal retryability evaluation changes.

**Test gate**

- Transient failures retry up to budget.
- Interim does not mark non-retryable.
- Terminal-send path becomes non-retryable.
- Exhaustion path follows selected behavior.

**Exit criteria**

- Retry behavior is predictable and auditable across send classifications.

### Step 8 - Async Followup + Observability Hardening + Final Acceptance

**Layer added**

- Production hardening and non-core side-effect decoupling.

**Work scope**

- Move title/sentiment/priority/category updates into async followup paths.
- Finalize metrics.
- Tighten invariants and telemetry around drops, retries, and lag.

**Spec refinement target**

- Finalize Sections 8, 10, 11, and 12 with acceptance criteria and known tradeoffs.

**Public API/interface impact**

- External contracts unchanged; monitoring contract expanded internally.

**Test gate**

- Async followup isolation tests.
- Metrics emission tests.
- Full acceptance scenario suite from Section 10.

**Exit criteria**

- End-to-end behavior matches this spec and is rollout-ready.
