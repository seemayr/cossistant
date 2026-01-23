/**
 * Prompt Templates
 *
 * Reusable prompt fragments for building system prompts.
 * The main messaging rules are in security.ts (CORE_SECURITY_PROMPT).
 */

export const PROMPT_TEMPLATES = {
	/**
	 * Real-time context about the visitor and conversation
	 */
	REALTIME_CONTEXT: `## Current Context

{visitorContext}

{temporalContext}

{conversationMeta}`,

	/**
	 * Available tools - placeholder for dynamic tool list
	 */
	TOOLS_AVAILABLE: `## Available Tools

{toolList}`,

	/**
	 * Reinforcement of tools-only workflow
	 */
	STRUCTURED_OUTPUT: `## IMPORTANT: Tools Are Required

You cannot communicate without tools. Follow this exact pattern:

1. FIRST: Call sendMessage() with your response text
2. THEN: Call an action tool (respond, escalate, resolve, skip, or markSpam)

The visitor ONLY sees messages from sendMessage(). If you skip it, they see nothing.`,

	/**
	 * Escalation guidelines
	 */
	ESCALATION_GUIDELINES: `## When to Escalate

- Visitor asks for a human
- You don't know the answer
- Issue needs human judgment
- Visitor is frustrated
- Legal/compliance concern`,

	/**
	 * Capabilities awareness
	 */
	CAPABILITIES: `## Capabilities

**Can:** Respond, escalate, resolve, search knowledge base
**Cannot:** Make purchases, refunds, account changes`,
} as const;
