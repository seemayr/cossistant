# Research Notes: AI Agent Behavior Overhaul

## Current State Analysis

### Issue 1: Hallucination (Making Up Answers)

**Root Cause:**
- The prompts mention "If you don't know something, say so honestly" but don't enforce it strongly
- No explicit instruction to say "I don't know" or escalate when uncertain
- The confidence score exists but isn't used to gate responses
- No instruction to ONLY answer from knowledge base results

**Current Prompt (templates.ts:97-105):**
```
When responding to visitors:
1. Be helpful, concise, and professional
2. Address their specific question or concern
3. If you don't know something, say so honestly
4. Offer to connect them with a human agent if needed
5. Don't make promises you can't keep
6. Don't reveal internal processes or systems
```

**Solution:**
- Add explicit "NO HALLUCINATION" rule in core prompt
- Instruct AI to:
  - Use `searchKnowledgeBase` tool FIRST for factual questions
  - Only answer from knowledge base results or common knowledge
  - Respond "I don't have that information" + escalate when uncertain
- Use confidence score to trigger escalation (< 0.7 = uncertain)

---

### Issue 2: Verbosity (Talks Too Much)

**Root Cause:**
- Prompts say "Be helpful, concise, and professional" but that's too weak
- No character limits or brevity enforcement
- The "NEVER GO SILENT" template is quite long and encourages extensive explanations
- Examples in prompts are long-form

**Current Prompt Patterns:**
- Long examples with multiple sentences
- No length guidance
- Encourages explanations for every action

**Solution:**
- Add explicit brevity rules: "1-2 sentences max unless necessary"
- Rewrite examples to be shorter
- Add "Don't over-explain" instruction
- Consider max character guidance

---

### Issue 3: Unnatural Single-Message Responses

**Root Cause:**
- The structured output returns ONE `visitorMessage` string
- Execution step sends ONE message
- No mechanism to send multiple messages

**Technical Constraint:**
- AI SDK `generateText` with structured output = ONE output object
- Can't naturally return multiple messages

**Solution Options:**

**Option A: Multi-message Tool (RECOMMENDED)**
Add a `sendMessageToVisitor` tool that:
- Allows AI to send messages inline during generation
- AI can call it multiple times
- Final `visitorMessage` becomes empty or a follow-up
- Messages are sent in real-time as tool calls execute

**Option B: Message Array in Schema**
Change `visitorMessage: string` to `visitorMessages: string[]`
- Execution step sends them in sequence with small delays
- Simpler but less natural (all sent at once at end)

**Option C: Message Delimiter**
Allow `---` or `[PAUSE]` in visitorMessage to split into multiple messages
- Execution step splits and sends with delays
- Hacky but minimal changes

**Recommendation: Option A**
- Most natural
- Real-time sending during generation
- AI has full control over when to "send"
- Works with existing tool pattern

---

### Issue 4: Over-Cautious Decision Step

**Root Cause (2-decision.ts:189-195):**
```typescript
// Check if trigger is from visitor (AI responds to visitor messages)
if (triggerMessage?.senderType !== "visitor") {
  return {
    shouldAct: false,
    reason: "Trigger message is not from visitor",
    mode: "background_only",
  };
}
```

**This means:**
- AI ONLY responds when visitor sends a message
- If human sends a public message, AI stays silent
- If conversation has activity but visitor is waiting, AI won't proactively follow up

**Problem Scenarios:**
1. Human agent says "Let me check on that" → visitor waits → AI should proactively follow up
2. New conversation created but visitor hasn't typed yet → AI should greet
3. Visitor sends message, AI responds, visitor doesn't reply for a while → AI could check in

**Solution:**
- Add proactive response mode in decision logic
- Detect scenarios where AI should initiate:
  - First message in conversation (greeting)
  - Visitor waiting too long after human said they'd help
  - Follow-up on unresolved questions
- Add setting: `proactiveResponses: boolean`

---

## Proposed Changes Summary

### 1. Prompts (Anti-Hallucination + Brevity)

**templates.ts - Rewrite VISITOR_RESPONSE:**
```typescript
VISITOR_RESPONSE: `## Response Rules

1. BE BRIEF - 1-2 sentences max. Don't over-explain.
2. NO HALLUCINATION - Only answer if you KNOW the answer:
   - Use searchKnowledgeBase for factual questions
   - If not in knowledge base → "I don't have that info, let me connect you with the team"
   - Never make up information
3. BE HONEST - Don't know? Say so and escalate.
4. NO PROMISES - Don't commit to things you can't do.`
```

**templates.ts - Shorten NEVER_GO_SILENT:**
Keep it brief, remove verbose examples.

**security.ts - Add NO HALLUCINATION to core rules:**
```
### Rule 4: No Hallucination
Never make up information. If you don't know:
- Say "I don't have that information"
- Use searchKnowledgeBase for factual questions
- Escalate to human if uncertain
```

### 2. New Tool: sendMessageToVisitor

**New file: tools/send-message.ts**
```typescript
export function createSendMessageTool(context: ToolContext): CoreTool {
  return tool({
    description: "Send a message to the visitor. Use this to send multiple natural messages instead of one long response.",
    parameters: z.object({
      message: z.string().describe("The message to send"),
    }),
    execute: async ({ message }) => {
      await sendMessage({
        db: context.db,
        conversationId: context.conversationId,
        // ... other params
        text: message,
        idempotencyKey: `${context.messageId}-tool-${Date.now()}`,
      });
      return { sent: true };
    },
  });
}
```

**Update tools/index.ts:**
Add `sendMessageToVisitor` tool for all agents.

**Update prompts:**
Add instruction that AI can use this tool for multi-message responses.

### 3. Decision Logic (Proactive Mode)

**Add to 2-decision.ts:**
```typescript
// New: Check for proactive response scenarios
if (settings.proactiveResponses) {
  const proactiveResult = checkProactiveScenarios(
    conversation,
    conversationHistory,
    conversationState
  );
  if (proactiveResult.shouldProact) {
    return {
      shouldAct: true,
      reason: proactiveResult.reason,
      mode: "respond_to_visitor",
      humanCommand: null,
    };
  }
}
```

**New function:**
```typescript
function checkProactiveScenarios(...): { shouldProact: boolean; reason: string } {
  // 1. First message - greet
  // 2. Visitor waiting too long
  // 3. Unresolved follow-up needed
}
```

**Add setting:**
`proactiveResponses: boolean` (default: true)

### 4. Schema Update (Optional)

Consider changing confidence to trigger escalation:
```typescript
// In execution, if decision.confidence < 0.7:
// Override action to escalate
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `prompts/templates.ts` | Rewrite VISITOR_RESPONSE, shorten NEVER_GO_SILENT |
| `prompts/security.ts` | Add Rule 4: No Hallucination |
| `tools/index.ts` | Add sendMessageToVisitor tool |
| `tools/send-message.ts` | NEW - Create sendMessageToVisitor tool |
| `tools/types.ts` | Add messageId to ToolContext |
| `pipeline/2-decision.ts` | Add proactive response logic |
| `pipeline/3-generation.ts` | Pass messageId to tool context |
| `settings/types.ts` | Add proactiveResponses setting |
| `settings/defaults.ts` | Set default for proactiveResponses |
| `output/schemas.ts` | Consider making visitorMessage optional (if using tool) |

---

## Prompt Rewrites (Short & Impactful)

### Core Principle
> Short, simple, impactful.

Current prompts are too long. Rewriting to be concise.

### New VISITOR_RESPONSE
```
## Response Rules
- BRIEF: 1-2 sentences. No rambling.
- HONEST: Don't know? Say "I don't have that info" and escalate.
- NO HALLUCINATION: Only answer from knowledge base or certain knowledge.
- NO PROMISES: Don't commit to things you can't fulfill.
```

### New NEVER_GO_SILENT (condensed)
```
## Always Respond
Never leave the visitor waiting without a message.
- respond: Answer their question
- escalate: "Connecting you with the team!"
- resolve: "Resolved! Reach out anytime."
- skip: Ask a clarifying question instead
```

### Tool Instruction for Multi-Message
```
## Natural Messaging
Use sendMessageToVisitor to send messages naturally.
You can send multiple short messages instead of one long one.
Example: Send a greeting, then the answer, then an offer to help more.
```
