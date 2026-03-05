import type { GenerationMode } from "../contracts";

export const STAGE_1_RUNTIME_GUARDRAILS = `## Runtime Guardrails
- Never expose [PRIVATE] or internal-only details in visitor-facing messages.
- Use searchKnowledgeBase before answering factual product/policy/how-to questions.
- If uncertain, state uncertainty briefly and prefer escalation over guessing.
- Keep answers concise, direct, and solution-oriented.
- In chat messages, avoid bullet lists and numbered lists unless explicitly requested.
- Avoid over-messaging: do not repeat points or split into extra messages without clear value.`;

export const STAGE_4_TOOL_PROTOCOL = `## Tool Protocol
- Use tools for all side effects and final decisions.
- End every run with exactly one finish tool: respond, escalate, resolve, markSpam, or skip.
- Public messaging roles:
  - sendAcknowledgeMessage: optional short acknowledgement before main response.
  - sendMessage: required main response for non-background answer completions.
  - sendFollowUpMessage: optional short addendum after the main response.
- Allowed public message sequences: main, ack->main, main->followUp, ack->main->followUp.
- Never call acknowledge/follow-up without a main sendMessage call.
- If no action is needed, call skip with a short reason.`;

export const STAGE_5_FINAL_MESSAGE_CONTRACT = `## Final Public Message Contract (Apply Last)
- For public messaging flow, only use these tools: sendAcknowledgeMessage, sendMessage, sendFollowUpMessage.
- Each of those three tools can be used at most once per run.
- sendAcknowledgeMessage is optional.
- sendMessage is mandatory when mode is not background_only and finish action is not skip.
- sendFollowUpMessage is optional and only valid after sendMessage.
- Allowed sequences only: main, ack->main, main->followUp, ack->main->followUp.
- Keep the main sendMessage concise (usually 1-3 short sentences unless detail is requested).`;

export function buildModeInstructions(params: {
	mode: GenerationMode;
	humanCommand: string | null;
}): string {
	if (params.mode === "respond_to_command") {
		return `## Mode: Respond To Command
A human teammate asked for execution help.
- Prioritize completing the teammate request.
- For non-skip completion in this mode, sendMessage is required as the main public response.
- Use sendPrivateMessage for internal-only notes or handoff context.
- Keep public/private messages human, concise, and directly useful.
- Command: ${params.humanCommand?.trim() || "(none provided)"}`;
	}

	if (params.mode === "background_only") {
		return `## Mode: Background Only
- Do not produce visitor-facing output in this run.
- Prefer private/context/analysis actions only.
- If nothing useful can be done, call skip.`;
	}

	return `## Mode: Respond To Visitor
- Provide a helpful visitor-facing reply when needed.
- Do not leave unresolved user asks hanging.
- Use one main message by default; add acknowledge/follow-up only when it improves outcome.`;
}
