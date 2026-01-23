# Task Plan: AI Agent Personality & Behavior Overhaul

## Goal
Make the AI agent more natural, honest, concise, and proactive - preventing hallucinations, reducing verbosity, enabling multi-message responses, and loosening decision safeguards.

## Phases
- [x] Phase 1: Research current implementation
- [x] Phase 2: Design solutions for each issue
- [x] Phase 3: Implement changes
- [x] Phase 4: Review and validate

---

## Implementation Summary

### Issue 1: Prevent Hallucination ✅ DONE

**Changes Made:**
- Added explicit "NO HALLUCINATION" rule to `prompts/security.ts` (Rule 4)
- Updated `prompts/templates.ts` VISITOR_RESPONSE to emphasize using searchKnowledgeBase first
- Added confidence-based escalation in `pipeline/4-execution.ts` (< 0.6 = auto-escalate)

### Issue 2: Reduce Verbosity ✅ DONE

**Changes Made:**
- Rewrote `VISITOR_RESPONSE` template: "1-2 sentences max. Don't ramble."
- Condensed `NEVER_GO_SILENT` from ~30 lines to ~8 lines
- Shortened `STRUCTURED_OUTPUT` template
- Condensed `ESCALATION_GUIDELINES` and `CAPABILITIES` templates
- Updated `SECURITY_REMINDER` to be brief

### Issue 3: Enable Multi-Message Responses ✅ DONE

**Changes Made:**
- Created new `tools/send-message-tool.ts` with `sendMessageToVisitor` tool
- Registered tool in `tools/index.ts`
- Added `triggerMessageId` to `ToolContext` in `tools/types.ts`
- Updated `pipeline/3-generation.ts` to pass `triggerMessageId`
- Updated `pipeline/index.ts` to pass `triggerMessageId` to generate()
- Made `visitorMessage` optional in `output/schemas.ts`
- Updated `pipeline/4-execution.ts` to handle optional visitorMessage

### Issue 4: More Proactive Responses ✅ DONE

**Changes Made:**
- Added `proactiveMode` setting to `settings/types.ts`
- Set default to `true` in `settings/defaults.ts`
- Added to schema validation in `settings/validator.ts`
- Added `checkProactiveScenarios()` function in `pipeline/2-decision.ts`
- Proactive triggers:
  - Greeting new conversations (empty history)
  - Following up when visitor waiting 5+ minutes

---

## Files Modified

| File | Changes |
|------|---------|
| `prompts/templates.ts` | Rewrote VISITOR_RESPONSE, NEVER_GO_SILENT, STRUCTURED_OUTPUT, ESCALATION_GUIDELINES, CAPABILITIES, TOOLS_AVAILABLE |
| `prompts/security.ts` | Added Rule 4: No Hallucination, shortened SECURITY_REMINDER |
| `tools/send-message-tool.ts` | NEW: sendMessageToVisitor tool |
| `tools/index.ts` | Registered sendMessageToVisitor tool |
| `tools/types.ts` | Added triggerMessageId to ToolContext |
| `pipeline/index.ts` | Pass triggerMessageId to generate() |
| `pipeline/2-decision.ts` | Added checkProactiveScenarios(), proactive mode logic |
| `pipeline/3-generation.ts` | Accept and use triggerMessageId |
| `pipeline/4-execution.ts` | Handle optional visitorMessage, add confidence-based escalation |
| `settings/types.ts` | Added proactiveMode setting |
| `settings/defaults.ts` | Set proactiveMode: true default |
| `settings/validator.ts` | Added proactiveMode to schema |
| `output/schemas.ts` | Made visitorMessage optional |

---

## Key Behaviors After Changes

1. **Anti-Hallucination**
   - AI must use `searchKnowledgeBase` for factual questions
   - If not found → say "I don't have that info" and escalate
   - Confidence < 0.6 → auto-escalate instead of responding

2. **Brevity**
   - 1-2 sentences max per message
   - No rambling or over-explaining

3. **Multi-Message**
   - AI can call `sendMessageToVisitor` multiple times
   - Natural conversational flow like humans
   - Final `visitorMessage` can be empty if sent via tool

4. **Proactive Mode**
   - Greets new conversations
   - Follows up when visitor waiting 5+ minutes
   - Still respects human assignee and escalation status

---

## Status
**COMPLETE** - All changes implemented and type-checked successfully.
