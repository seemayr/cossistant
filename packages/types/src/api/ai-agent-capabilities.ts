export const AI_AGENT_TOOL_CATEGORIES = [
	"system",
	"messaging",
	"action",
	"context",
	"analysis",
] as const;

export type AiAgentToolCategory = (typeof AI_AGENT_TOOL_CATEGORIES)[number];

export const AI_AGENT_TOOL_IDS = [
	"searchKnowledgeBase",
	"identifyVisitor",
	"updateConversationTitle",
	"updateSentiment",
	"setPriority",
	"sendMessage",
	"sendPrivateMessage",
	"respond",
	"escalate",
	"resolve",
	"markSpam",
	"skip",
] as const;

export type AiAgentToolId = (typeof AI_AGENT_TOOL_IDS)[number];

export const AI_AGENT_BEHAVIOR_SETTING_KEYS = [
	"canResolve",
	"canMarkSpam",
	"canSetPriority",
	"canEscalate",
	"autoGenerateTitle",
	"autoAnalyzeSentiment",
] as const;

export type AiAgentBehaviorSettingKey =
	(typeof AI_AGENT_BEHAVIOR_SETTING_KEYS)[number];

export type AiAgentToolCatalogEntry = {
	id: AiAgentToolId;
	label: string;
	description: string;
	category: AiAgentToolCategory;
	isSystem: boolean;
	isRequired: boolean;
	isToggleable: boolean;
	behaviorSettingKey: AiAgentBehaviorSettingKey | null;
	defaultTemplateNames: string[];
};

export const AI_AGENT_TOOL_CATALOG: readonly AiAgentToolCatalogEntry[] = [
	{
		id: "searchKnowledgeBase",
		label: "Search Knowledge Base",
		description:
			"Looks up product or policy facts in your trained knowledge before answering.",
		category: "context",
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultTemplateNames: ["deep-research.md", "grounded-answers.md"],
	},
	{
		id: "identifyVisitor",
		label: "Identify Visitor",
		description:
			"Links visitor details to a contact record when name and email are collected.",
		category: "context",
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultTemplateNames: ["visitor-identification.md"],
	},
	{
		id: "updateConversationTitle",
		label: "Update Conversation Title",
		description:
			"Sets or refreshes the conversation title once the topic is clear.",
		category: "analysis",
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "autoGenerateTitle",
		defaultTemplateNames: ["title-hygiene.md"],
	},
	{
		id: "updateSentiment",
		label: "Update Sentiment",
		description:
			"Tracks tone shifts and keeps conversation sentiment metadata up to date.",
		category: "analysis",
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "autoAnalyzeSentiment",
		defaultTemplateNames: ["sentiment-tracking.md"],
	},
	{
		id: "setPriority",
		label: "Set Priority",
		description:
			"Adjusts urgency level for critical issues so teams can triage quickly.",
		category: "analysis",
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canSetPriority",
		defaultTemplateNames: ["priority-triage.md"],
	},
	{
		id: "sendMessage",
		label: "Send Public Message",
		description: "Sends a visible reply to the visitor.",
		category: "messaging",
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultTemplateNames: ["tone-and-voice.md", "short-clear-replies.md"],
	},
	{
		id: "sendPrivateMessage",
		label: "Send Private Note",
		description:
			"Adds internal-only notes for teammates that visitors cannot see.",
		category: "messaging",
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultTemplateNames: ["handoff-notes.md"],
	},
	{
		id: "respond",
		label: "Finish: Respond",
		description: "Marks turn complete after responding to the visitor.",
		category: "action",
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultTemplateNames: ["reply-or-stay-silent.md"],
	},
	{
		id: "escalate",
		label: "Finish: Escalate",
		description: "Hands off the conversation to a human agent when needed.",
		category: "action",
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canEscalate",
		defaultTemplateNames: ["escalation-playbook.md"],
	},
	{
		id: "resolve",
		label: "Finish: Resolve",
		description: "Marks the conversation as resolved when it is fully handled.",
		category: "action",
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canResolve",
		defaultTemplateNames: ["resolution-checklist.md"],
	},
	{
		id: "markSpam",
		label: "Finish: Mark Spam",
		description: "Flags obvious spam or abuse and closes the conversation.",
		category: "action",
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canMarkSpam",
		defaultTemplateNames: ["spam-detection.md"],
	},
	{
		id: "skip",
		label: "Finish: Skip",
		description:
			"Intentionally stays silent when no response is needed from AI.",
		category: "action",
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultTemplateNames: ["reply-or-stay-silent.md"],
	},
] as const;

export const AI_AGENT_DEFAULT_SKILL_TEMPLATES = [
	{
		name: "reply-or-stay-silent.md",
		label: "Reply Or Stay Silent",
		description:
			"Defines when the AI should answer and when it should intentionally stay silent.",
		content: `## Reply Decision

- Reply when the visitor still needs a clear, concrete answer.
- Stay silent when a human already answered well or when the message is only acknowledgement.
- If unsure whether to reply, prefer one short helpful message over multiple partial replies.

## Tool Notes

- Use [@Send Public Message](mention:tool:sendMessage) only when a reply adds value.
- Finish with [@Finish: Respond](mention:tool:respond) after replying.
- Use [@Finish: Skip](mention:tool:skip) when no reply is required.`,
		suggestedToolIds: ["sendMessage", "respond", "skip"] as const,
	},
	{
		name: "tone-and-voice.md",
		label: "Tone And Voice",
		description:
			"Keeps replies concise, empathetic, and aligned with a support tone.",
		content: `## Tone

- Be concise, direct, and calm.
- Prefer plain language over jargon.
- Keep messages to 1-2 short sentences when possible.

## Empathy

- Acknowledge frustration without over-apologizing.
- Focus on the next useful action.

## Tool Notes

- Send customer-visible text through [@Send Public Message](mention:tool:sendMessage).`,
		suggestedToolIds: ["sendMessage"] as const,
	},
	{
		name: "short-clear-replies.md",
		label: "Short Clear Replies",
		description: "Enforces short, structured customer-facing responses.",
		content: `## Message Shape

- First sentence: direct answer.
- Optional second sentence: next step or clarifying question.
- Avoid multi-paragraph replies unless the question is complex.

## Tool Notes

- Send the final customer reply with [@Send Public Message](mention:tool:sendMessage).`,
		suggestedToolIds: ["sendMessage"] as const,
	},
	{
		name: "deep-research.md",
		label: "Deep Research",
		description:
			"Guides multi-pass retrieval before giving factual or policy answers.",
		content: `## Research Workflow

- For factual/product/policy questions, search before answering.
- Start with a short focused query, then broaden if needed.
- Use at least one follow-up search if confidence is low.

## Tool Notes

- Use [@Search Knowledge Base](mention:tool:searchKnowledgeBase) for retrieval.
- Only send final claims after grounding them in retrieved context.`,
		suggestedToolIds: ["searchKnowledgeBase"] as const,
	},
	{
		name: "grounded-answers.md",
		label: "Grounded Answers",
		description:
			"Prevents hallucinations and enforces transparent uncertainty.",
		content: `## Grounding Rules

- Do not invent product, policy, or pricing details.
- If information is missing, say so clearly and offer escalation.
- Prefer partial certainty over confident guessing.

## Tool Notes

- Validate facts with [@Search Knowledge Base](mention:tool:searchKnowledgeBase).
- If unsupported, use [@Finish: Escalate](mention:tool:escalate) when available.`,
		suggestedToolIds: ["searchKnowledgeBase", "escalate"] as const,
	},
	{
		name: "visitor-identification.md",
		label: "Visitor Identification",
		description:
			"Controls when and how to request name/email and identify the visitor.",
		content: `## Identification Policy

- Ask for name and email only when needed for account-specific help.
- Validate that the name field contains a name and email field contains an email.
- Update details if the visitor corrects their information.

## Tool Notes

- Link identity with [@Identify Visitor](mention:tool:identifyVisitor).`,
		suggestedToolIds: ["identifyVisitor"] as const,
	},
	{
		name: "escalation-playbook.md",
		label: "Escalation Playbook",
		description:
			"Defines when escalation is mandatory and what to include in handoff.",
		content: `## Escalate When

- The visitor asks for a human.
- You cannot find reliable information.
- Legal, compliance, billing, or high-risk judgment is required.

## Handoff Quality

- Tell the visitor what happens next.
- Leave concise internal context for teammates.

## Tool Notes

- Notify visitor with [@Send Public Message](mention:tool:sendMessage).
- Add handoff context via [@Send Private Note](mention:tool:sendPrivateMessage).
- Finish with [@Finish: Escalate](mention:tool:escalate).`,
		suggestedToolIds: [
			"sendMessage",
			"sendPrivateMessage",
			"escalate",
		] as const,
	},
	{
		name: "resolution-checklist.md",
		label: "Resolution Checklist",
		description:
			"Ensures conversations are only resolved after clear completion criteria.",
		content: `## Resolve Criteria

- The visitor's request is fully addressed.
- No unresolved dependency remains.
- The final response includes a clear closure.

## Tool Notes

- Send closure text with [@Send Public Message](mention:tool:sendMessage).
- Finish with [@Finish: Resolve](mention:tool:resolve).`,
		suggestedToolIds: ["sendMessage", "resolve"] as const,
	},
	{
		name: "spam-detection.md",
		label: "Spam Detection",
		description: "Sets strict criteria for spam classification.",
		content: `## Spam Heuristics

- Mark as spam only for obvious bot, phishing, or abusive noise.
- Do not mark difficult but valid customer requests as spam.

## Tool Notes

- Use [@Finish: Mark Spam](mention:tool:markSpam) only when highly confident.`,
		suggestedToolIds: ["markSpam"] as const,
	},
	{
		name: "priority-triage.md",
		label: "Priority Triage",
		description: "Standardizes urgency assignment for incoming issues.",
		content: `## Priority Rules

- Urgent: outages, security incidents, severe business impact.
- High: blocked workflow with no workaround.
- Normal: standard product support requests.
- Low: informational or minor questions.

## Tool Notes

- Set urgency with [@Set Priority](mention:tool:setPriority).`,
		suggestedToolIds: ["setPriority"] as const,
	},
	{
		name: "sentiment-tracking.md",
		label: "Sentiment Tracking",
		description: "Encourages sentiment updates when tone changes.",
		content: `## Sentiment Updates

- Update sentiment when tone shifts meaningfully.
- Keep reason short and factual.
- Avoid over-updating on minor wording changes.

## Tool Notes

- Record tone with [@Update Sentiment](mention:tool:updateSentiment).`,
		suggestedToolIds: ["updateSentiment"] as const,
	},
	{
		name: "title-hygiene.md",
		label: "Title Hygiene",
		description: "Keeps conversation titles clear and actionable.",
		content: `## Title Standards

- Keep titles short and specific.
- Reflect the primary issue, not generic phrases.
- Update title if topic changes significantly.

## Tool Notes

- Use [@Update Conversation Title](mention:tool:updateConversationTitle).`,
		suggestedToolIds: ["updateConversationTitle"] as const,
	},
	{
		name: "handoff-notes.md",
		label: "Handoff Notes",
		description: "Improves private notes shared with human teammates.",
		content: `## Private Note Checklist

- Include issue summary, key facts, and what was already tried.
- Add urgency and expected next action.
- Keep notes scannable and concise.

## Tool Notes

- Send internal details with [@Send Private Note](mention:tool:sendPrivateMessage).`,
		suggestedToolIds: ["sendPrivateMessage"] as const,
	},
] as const;

export type AiAgentDefaultSkillTemplate =
	(typeof AI_AGENT_DEFAULT_SKILL_TEMPLATES)[number];

export type AiAgentSystemSkillMetadataEntry = {
	name:
		| "agent.md"
		| "security.md"
		| "behaviour.md"
		| "participation.md"
		| "grounding.md"
		| "capabilities.md";
	label: string;
	description: string;
};

export const AI_AGENT_SYSTEM_SKILL_METADATA: readonly AiAgentSystemSkillMetadataEntry[] =
	[
		{
			name: "agent.md",
			label: "Agent Identity",
			description: "Core role, persona, and mission of the assistant.",
		},
		{
			name: "security.md",
			label: "Security Guardrails",
			description:
				"Critical safety and confidentiality rules that should stay strict.",
		},
		{
			name: "behaviour.md",
			label: "Behavior Policy",
			description: "Runtime behavior and mode-specific operating guidance.",
		},
		{
			name: "participation.md",
			label: "Participation Policy",
			description:
				"Rules for when AI should participate versus intentionally stay silent.",
		},
		{
			name: "grounding.md",
			label: "Grounding Policy",
			description:
				"Instructions for factual grounding and knowledge retrieval discipline.",
		},
		{
			name: "capabilities.md",
			label: "Capabilities Contract",
			description:
				"Capability boundaries and references to optional behavior skills.",
		},
	];
