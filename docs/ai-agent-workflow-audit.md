# AI Agent Workflow Audit (Vercel AI SDK)

## Scope
- Reviewed the production AI workflow in `apps/api/src/ai-agent/**` with focus on fail-safe behavior, prompt quality, and simplification without feature loss.
- Focused on the 5-step pipeline (`intake → decision → generation → execution → followup`), smart decision gate, tool-loop generation, and system prompt composition.

## Executive Summary
- **Overall:** The architecture is solid and intentionally defensive (multi-stage gating, abort handling, fallback messaging, and usage guardrails).
- **Main risk:** Prompt and policy logic is currently spread across multiple sections that partially overlap, making behavior harder to reason about and tune.
- **Main simplification opportunity:** Consolidate repeated behavioral rules into one authoritative policy block and keep dynamic prompt sections strictly data/context.
- **Scale readiness:** Good base for scale, but reliability can improve with stricter deterministic pre-rules for high-risk intents and a smaller, clearer prompt contract.

## What Is Already Fail-Safe
1. **Pipeline hard gates before generation**
   - Intake can short-circuit quickly.
   - Continuation gate can skip/supplement duplicate queued triggers.
   - Decision gate can skip non-actionable runs.
2. **Credit guard before expensive generation**
   - Run is blocked before generation when credits are insufficient.
3. **Generation timeout and cancellation path**
   - 45s hard timeout with abort signal.
   - Abort maps to safe `skip` with no unsafe side effects.
4. **Tool-only enforcement**
   - Uses required tool calling with explicit finish tools.
   - Tracks missing action / missing send and attempts repair.
5. **Public response fallback**
   - If model picks `respond/escalate/resolve` but fails to send a public message, system sends a safe fallback response.
6. **Final cleanup & event consistency**
   - Followup and typing cleanup in `finally` block reduce stuck UX state.

## Prompt Audit: Cleanliness, Duplication, Fluff

### Findings
1. **Rule duplication exists across prompt layers**
   - Tool requirements and finish-tool sequencing appear in both security prompt and structured-output template.
   - Hallucination prevention appears in security and grounding sections.
   - Escalation guidance appears in dedicated templates and side references.
2. **Policy + mechanics + style are mixed together**
   - The same prompt includes safety policy, tool protocol, stylistic writing advice, and runtime context.
3. **Prompt grows with runtime tool/skill sections on every step**
   - `prepareStep` rebuilds system prompt each loop step; this is flexible but token-heavy and harder to debug.
4. **Decision policy is long and partly overlaps smart-decision deterministic rules**
   - Some “greeting/ack” behavior is in prompt policy and also in code rules.

### Impact
- Higher token spend and latency.
- Harder policy governance at scale (teams can unintentionally create conflicts between core docs and fallback templates).
- Increased risk of regressions when editing behavior text.

### Recommendation (No Feature Loss)
Adopt a **3-block prompt contract**:
1. **Safety + channel policy (immutable, short, canonical)**
2. **Tool protocol (immutable, short, canonical)**
3. **Runtime context (dynamic facts only; no repeated policy language)**

And enforce: “any instruction that sounds like a rule appears in exactly one canonical block.”

## Critical Edge Cases (Be Very Strict)

### A. False negative response during model failures
- Smart decision defaults to `observe` if all models fail/time out.
- This is safe but can suppress needed responses during incidents.
- Recommendation: add deterministic “urgent visitor distress/error keywords” fast-path to force `respond` even if model decision fails.

### B. Tool budget exhaustion before terminal action
- Budget guard is strong, but if exhausted before complete public response, result may be `skip`.
- Recommendation: reserve a strict terminal budget (e.g., always preserve final slot for `respond/escalate/resolve/skip`) and warn earlier when budget is near cap.

### C. Prompt-injection handling is monitor-first
- Injection detection logs attempts but does not alter flow.
- Current security prompt is good, but for scale consider deterministic hardening:
  - if injection detected + low confidence + private content nearby → force constrained mode (limited tool subset).

### D. Mention parsing ambiguity
- Plain `@name` detection can match partial forms and may produce false positives in edge naming conventions.
- Recommendation: normalize strict mention boundaries and require confidence threshold for plaintext mentions in noisy chats.

### E. Fallback message genericity
- Fallback public message is intentionally generic; good for safety but may degrade trust for specialized questions.
- Recommendation: add 2-3 fallback variants keyed by trigger type (billing, bug, account) using deterministic classification.

## Simplification Plan (Practical)

### Phase 1: Prompt normalization (highest ROI)
- Create a single canonical “rules ledger”:
  - `RULE-CHANNEL-001`: private/public separation
  - `RULE-TOOL-001`: tools-only response protocol
  - `RULE-FACT-001`: no fabricated facts / retrieval requirement
- Reference each rule once in prompt text; remove duplicated language from templates.
- Keep dynamic sections fact-only: visitor facts, temporal info, convo metadata, available tools/skills.

### Phase 2: Deterministic safety envelope expansion
- Add pre-LLM deterministic urgent-intent classifier (cheap regex + keyword + sentiment signal).
- If hit, bypass smart decision ambiguity and force `respond` path with constrained prompt.

### Phase 3: Operational guardrails
- Add metrics + alerts:
  - fallback-message rate
  - “missing action” repair rate
  - “observe on model-failure” count
  - tool-budget exhaustion rate
- Set SLO alarms when these exceed baseline.

## Fail-Safe Verdict
- **Today:** Strong defensive architecture with good recovery behavior.
- **Not yet “max fail-safe/simple”:** Prompt governance is too distributed and partly repetitive, which increases tuning complexity and hidden conflicts.
- **After the 3-phase simplification:** You keep the same features while making behavior easier to reason about, cheaper to run, and safer under edge-case stress.

## Immediate Action Checklist
- [ ] Consolidate repeated prompt rules into one canonical block.
- [ ] Reduce prompt to policy + protocol + facts (remove repeated reminders).
- [ ] Add deterministic urgent-intent override for smart-decision failure paths.
- [ ] Reserve terminal tool budget slot.
- [ ] Add production alerts for fallback/repair/observe-fallback anomalies.
