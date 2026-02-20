import {
	serializeSkillFileContent,
	stripSkillMarkdownExtension,
} from "../skill-file-format";

export const AI_AGENT_TOOL_CATEGORIES = [
	"system",
	"messaging",
	"action",
	"context",
	"analysis",
] as const;

export type AiAgentToolCategory = (typeof AI_AGENT_TOOL_CATEGORIES)[number];

export const AI_AGENT_TOOL_GROUPS = ["behavior", "actions"] as const;
export type AiAgentToolGroup = (typeof AI_AGENT_TOOL_GROUPS)[number];

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
	"wait",
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

export type AiAgentToolDefaultSkill = {
	name: string;
	label: string;
	description: string;
	content: string;
};

export type AiAgentToolCatalogEntry = {
	id: AiAgentToolId;
	label: string;
	description: string;
	category: AiAgentToolCategory;
	group: AiAgentToolGroup;
	order: number;
	isSystem: boolean;
	isRequired: boolean;
	isToggleable: boolean;
	behaviorSettingKey: AiAgentBehaviorSettingKey | null;
	defaultSkill: AiAgentToolDefaultSkill;
};

type RawToolCatalogEntry = Omit<AiAgentToolCatalogEntry, "defaultSkill"> & {
	defaultSkill: Omit<AiAgentToolDefaultSkill, "content"> & {
		content: string;
	};
};

const AI_AGENT_TOOL_CATALOG_RAW: readonly RawToolCatalogEntry[] = [
	{
		id: "searchKnowledgeBase",
		label: "Search Knowledge Base",
		description:
			"Look up reliable product or policy context before answering factual requests.",
		category: "context",
		group: "behavior",
		order: 1,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "search-knowledge-base.md",
			label: "Search Knowledge Base",
			description: "How to retrieve and ground facts before answering.",
			content: `## Retrieval Rules

- Search before answering factual or policy questions.
- Start narrow, then broaden if no reliable match is found.
- Prefer one strong source over many weak guesses.

## Output Rules

- If no reliable answer is found, say that clearly and escalate when needed.
- Never invent pricing, policy, or product details.`,
		},
	},
	{
		id: "identifyVisitor",
		label: "Identify Visitor",
		description:
			"Collect and link visitor identity details when account-specific support is needed.",
		category: "context",
		group: "behavior",
		order: 2,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "identify-visitor.md",
			label: "Identify Visitor",
			description: "When to ask for name/email and how to use identification.",
			content: `## Identification Rules

- Ask for name and email only when account context is required.
- Validate basic email shape before linking identity.
- Update details if the visitor corrects prior information.`,
		},
	},
	{
		id: "updateConversationTitle",
		label: "Update Conversation Title",
		description:
			"Keep titles clear and specific so the team can scan conversations quickly.",
		category: "analysis",
		group: "behavior",
		order: 3,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "autoGenerateTitle",
		defaultSkill: {
			name: "update-conversation-title.md",
			label: "Update Conversation Title",
			description: "How to set concise, actionable conversation titles.",
			content: `## Title Rules

- Keep titles short, specific, and issue-focused.
- Avoid generic titles like "Support question".
- Update title when the conversation topic changes materially.`,
		},
	},
	{
		id: "updateSentiment",
		label: "Update Sentiment",
		description:
			"Track meaningful tone changes so urgency and escalation signals stay accurate.",
		category: "analysis",
		group: "behavior",
		order: 4,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "autoAnalyzeSentiment",
		defaultSkill: {
			name: "update-sentiment.md",
			label: "Update Sentiment",
			description:
				"When to record sentiment changes and how to keep them precise.",
			content: `## Sentiment Rules

- Update sentiment only on meaningful tone shifts.
- Keep sentiment reasons short and factual.
- Avoid over-updating for minor wording changes.`,
		},
	},
	{
		id: "setPriority",
		label: "Set Priority",
		description:
			"Assign urgency consistently so critical issues surface fast for the team.",
		category: "analysis",
		group: "behavior",
		order: 5,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canSetPriority",
		defaultSkill: {
			name: "set-priority.md",
			label: "Set Priority",
			description: "How to map issue severity to priority levels.",
			content: `## Priority Rules

- Urgent: outage, security, or severe business impact.
- High: blocked workflow with no good workaround.
- Normal: standard support flow.
- Low: informational or low-impact request.`,
		},
	},
	{
		id: "sendMessage",
		label: "Send Public Message",
		description: "Send the customer-visible response.",
		category: "messaging",
		group: "behavior",
		order: 6,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "send-message.md",
			label: "Send Public Message",
			description: "Tone and structure for public replies.",
			content: `## Reply Style

- Be concise, direct, and calm.
- Use plain language.
- Prefer one clear next step.

## Quality Rules

- Avoid repeating prior messages.
- If uncertain, state uncertainty clearly instead of guessing.`,
		},
	},
	{
		id: "sendPrivateMessage",
		label: "Send Private Note",
		description: "Send internal notes to teammates that visitors cannot see.",
		category: "messaging",
		group: "behavior",
		order: 7,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "send-private-message.md",
			label: "Send Private Note",
			description: "How to write compact and useful internal notes.",
			content: `## Private Note Rules

- Include issue summary, key facts, and what has already been tried.
- Keep notes scannable and operational.
- Avoid customer-facing tone in internal notes.`,
		},
	},
	{
		id: "respond",
		label: "Finish: Respond",
		description: "Finish the run after sending a complete public response.",
		category: "action",
		group: "actions",
		order: 1,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "respond.md",
			label: "Finish Respond",
			description: "When to end with a completed response.",
			content: `## Respond Rules

- Use respond when the visitor has a complete, useful answer.
- Do not respond before the public message is sent.
- End cleanly once the turn is complete.`,
		},
	},
	{
		id: "escalate",
		label: "Finish: Escalate",
		description: "Escalate to a human when AI should not complete the request.",
		category: "action",
		group: "actions",
		order: 2,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canEscalate",
		defaultSkill: {
			name: "escalate.md",
			label: "Finish Escalate",
			description: "When escalation is required and how to hand off clearly.",
			content: `## Escalation Rules

- Escalate when visitor asks for a human, risk is high, or confidence is low.
- Tell the visitor what happens next.
- Leave a concise private handoff note when useful.`,
		},
	},
	{
		id: "resolve",
		label: "Finish: Resolve",
		description: "Mark conversation resolved once the issue is fully handled.",
		category: "action",
		group: "actions",
		order: 3,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canResolve",
		defaultSkill: {
			name: "resolve.md",
			label: "Finish Resolve",
			description: "Resolution criteria before closing a conversation.",
			content: `## Resolve Rules

- Resolve only when the request is fully addressed.
- Ensure no unresolved dependency remains.
- Confirm closure is clear in the final response.`,
		},
	},
	{
		id: "markSpam",
		label: "Finish: Mark Spam",
		description: "Mark obvious abuse/spam and close quickly.",
		category: "action",
		group: "actions",
		order: 4,
		isSystem: false,
		isRequired: false,
		isToggleable: true,
		behaviorSettingKey: "canMarkSpam",
		defaultSkill: {
			name: "mark-spam.md",
			label: "Finish Mark Spam",
			description: "Strict criteria for spam classification.",
			content: `## Spam Rules

- Mark spam only when abuse or bot patterns are obvious.
- Do not classify valid but difficult requests as spam.
- Prefer caution if confidence is low.`,
		},
	},
	{
		id: "skip",
		label: "Finish: Skip",
		description: "Finish without a public response when silence is better.",
		category: "action",
		group: "actions",
		order: 5,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "skip.md",
			label: "Finish Skip",
			description: "When intentional silence is the correct action.",
			content: `## Skip Rules

- Skip when no added value would come from another reply.
- Skip for acknowledgements or resolved conversations with no open need.`,
		},
	},
	{
		id: "wait",
		label: "Finish: Wait",
		description: "Defer briefly, then re-run with fresh context.",
		category: "action",
		group: "actions",
		order: 6,
		isSystem: true,
		isRequired: true,
		isToggleable: false,
		behaviorSettingKey: null,
		defaultSkill: {
			name: "wait.md",
			label: "Finish Wait",
			description: "When to defer and evaluate again shortly.",
			content: `## Wait Rules

- Wait when immediate action is premature and near-term context may change.
- Do not wait repeatedly without a clear reason.`,
		},
	},
] as const;

export const AI_AGENT_TOOL_CATALOG: readonly AiAgentToolCatalogEntry[] =
	AI_AGENT_TOOL_CATALOG_RAW.map((tool) => ({
		...tool,
		defaultSkill: {
			...tool.defaultSkill,
			content: serializeSkillFileContent({
				name: stripSkillMarkdownExtension(tool.defaultSkill.name),
				description: tool.defaultSkill.description,
				body: tool.defaultSkill.content,
			}),
		},
	}));

export const AI_AGENT_RESERVED_TOOL_SKILL_TEMPLATE_NAMES = [
	...new Set(AI_AGENT_TOOL_CATALOG.map((tool) => tool.defaultSkill.name)),
] as const;

export const AI_AGENT_DROPPED_SKILL_TEMPLATE_NAMES = [
	"reply-or-stay-silent.md",
	"send-message-behavior.md",
	"deep-research.md",
	"grounded-answers.md",
	"visitor-identification.md",
	"escalation-playbook.md",
	"resolution-checklist.md",
	"spam-detection.md",
	"priority-triage.md",
	"sentiment-tracking.md",
	"title-hygiene.md",
	"handoff-notes.md",
	"tone-and-voice.md",
	"short-clear-replies.md",
] as const;
