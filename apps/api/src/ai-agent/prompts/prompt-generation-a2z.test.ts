import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	AGENT_BASE_PROMPT_GENERATION_TEMPLATE,
	DEFAULT_AGENT_BASE_PROMPT as API_DEFAULT_AGENT_BASE_PROMPT,
} from "@api/constants/prompt-templates";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import { DEFAULT_AGENT_BASE_PROMPT as SHARED_DEFAULT_AGENT_BASE_PROMPT } from "@cossistant/types";
import type { ToolSet } from "ai";
import { getBehaviorPromptDefinition } from "../behaviors/catalog";
import type { RoleAwareMessage } from "../context/conversation";
import type { VisitorContext } from "../context/visitor";
import { getDefaultBehaviorSettings } from "../settings/defaults";
import type { ResolvedPromptBundle } from "./resolver";
import { buildFallbackCoreDocuments } from "./resolver";
import { CORE_SECURITY_PROMPT, SECURITY_REMINDER } from "./security";
import { PROMPT_TEMPLATES } from "./templates";

const mockedEnv = {
	OPENROUTER_API_KEY: "test-openrouter-key",
};

const createModelMock = mock((modelId: string) => ({ modelId }));
const generateTextMock = mock((async () => ({
	text: "Generated base prompt for testing with enough content length to pass validation and avoid fallback mode.",
})) as (...args: unknown[]) => Promise<unknown>);

const getTemporalContextMock = mock(() => ({
	currentTime: "9:15 AM",
	currentDate: "Monday, January 20, 2025",
	visitorLocalTime: "9:15 AM",
	greeting: "Good morning",
	dayOfWeek: "Monday",
}));

const formatTemporalContextForPromptMock = mock(
	() =>
		"It's currently **9:15 AM** for them (Good morning).\nToday is **Monday**, January 20, 2025."
);

const getConversationMetaMock = mock(() => ({
	messageCount: 4,
	visitorMessageCount: 2,
	startedAgo: "2 hours ago",
	lastVisitorActivity: "2 minutes ago",
	isFirstMessage: false,
}));

const formatConversationMetaForPromptMock = mock(
	() =>
		"Conversation started **2 hours ago** with **4 messages** so far. Last visitor message: **2 minutes ago**."
);

mock.module("@api/env", () => ({
	env: mockedEnv,
}));

mock.module("@api/lib/ai", () => ({
	DefaultModels: {
		promptGeneration: "openai/gpt-5.2",
	},
	createModel: createModelMock,
	generateText: generateTextMock,
}));

mock.module("../context/temporal", () => ({
	getTemporalContext: getTemporalContextMock,
	formatTemporalContextForPrompt: formatTemporalContextForPromptMock,
}));

mock.module("../context/conversation-meta", () => ({
	getConversationMeta: getConversationMetaMock,
	formatConversationMetaForPrompt: formatConversationMetaForPromptMock,
}));

const systemModulePromise = import("./system");
const promptGeneratorModulePromise = import("../../services/prompt-generator");

const FIXED_TIMESTAMP = "2025-01-20T14:00:00.000Z";

const CONVERSATION_HISTORY_FIXTURE: RoleAwareMessage[] = [
	{
		messageId: "msg-1",
		content: "Hey there, I need help with my invoice.",
		senderType: "visitor",
		senderId: "visitor-1",
		senderName: "Alex",
		timestamp: "2025-01-20T13:48:00.000Z",
		visibility: "public",
	},
	{
		messageId: "msg-2",
		content: "Absolutely, can you confirm the billing period?",
		senderType: "human_agent",
		senderId: "human-1",
		senderName: "Sarah",
		timestamp: "2025-01-20T13:52:00.000Z",
		visibility: "public",
	},
	{
		messageId: "msg-3",
		content: "It is for January.",
		senderType: "visitor",
		senderId: "visitor-1",
		senderName: "Alex",
		timestamp: "2025-01-20T13:58:00.000Z",
		visibility: "public",
	},
	{
		messageId: "msg-4",
		content: "I can also help with account notes internally.",
		senderType: "ai_agent",
		senderId: "ai-1",
		senderName: "Atlas",
		timestamp: "2025-01-20T13:59:00.000Z",
		visibility: "private",
	},
];

const VISITOR_CONTEXT_FIXTURE: VisitorContext = {
	name: "Alex Jordan",
	email: "alex@example.com",
	isIdentified: false,
	country: "United States",
	city: "Austin",
	language: "en-US",
	timezone: "America/Chicago",
	browser: "Chrome",
	device: "Desktop",
	metadata: null,
};

const TOOLS_FIXTURE = {
	searchKnowledgeBase: {
		description: "Search the knowledge base for factual answers.",
	},
	sendMessage: {
		description: "Send a public message to the visitor.",
	},
	respond: {
		description: "Finish the run after required actions are complete.",
	},
} as unknown as ToolSet;

const HUMAN_COMMAND_FIXTURE =
	"Give the visitor the exact next billing deadline and keep it concise.";

const SMART_DECISION_FIXTURE = {
	intent: "respond",
	reasoning:
		"The visitor asked a direct unresolved billing question and needs a concrete next step.",
	confidence: "high",
} as const;

const CONTINUATION_HINT_FIXTURE = {
	reason: "A queued trigger arrived after the latest AI reply.",
	confidence: "medium",
	deltaHint: "Only add the missing billing deadline detail.",
	latestAiMessageId: "msg-ai-latest",
	latestAiMessageText: "You can update billing in Settings > Billing.",
} as const;

type RuntimePromptOverrides = Partial<
	ReturnType<typeof buildFallbackCoreDocuments>
>;

function createAgent(): AiAgentSelect {
	return {
		id: "01JTESTA2ZAGENT0000000000",
		name: "Atlas",
		description: null,
		basePrompt: SHARED_DEFAULT_AGENT_BASE_PROMPT,
		model: "openai/gpt-5-mini",
		temperature: 0.7,
		maxOutputTokens: 1024,
		organizationId: "01JTESTORG00000000000000",
		websiteId: "01JTESTWEB00000000000000",
		isActive: true,
		lastUsedAt: null,
		lastTrainedAt: null,
		trainingStatus: "idle",
		trainingProgress: 0,
		trainingError: null,
		trainingStartedAt: null,
		trainedItemsCount: null,
		usageCount: 0,
		goals: null,
		metadata: null,
		behaviorSettings:
			getDefaultBehaviorSettings() as AiAgentSelect["behaviorSettings"],
		onboardingCompletedAt: null,
		createdAt: FIXED_TIMESTAMP,
		updatedAt: FIXED_TIMESTAMP,
		deletedAt: null,
	};
}

function createConversation(): ConversationSelect {
	return {
		id: "conv-a2z",
		createdAt: "2025-01-20T12:00:00.000Z",
	} as ConversationSelect;
}

function toFallbackPromptBundle(
	aiAgent: AiAgentSelect,
	overrides: RuntimePromptOverrides = {}
): ResolvedPromptBundle {
	const fallbackCoreDocuments = buildFallbackCoreDocuments(
		aiAgent,
		"respond_to_visitor"
	);
	const merged = { ...fallbackCoreDocuments, ...overrides };
	const coreDocuments = Object.fromEntries(
		Object.entries(merged).map(([name, content]) => [
			name,
			{
				name,
				content,
				source: "fallback",
				priority: 0,
			},
		])
	) as ResolvedPromptBundle["coreDocuments"];

	return {
		coreDocuments,
		enabledSkills: [],
	};
}

function countOccurrences(input: string, pattern: string): number {
	return input.split(pattern).length - 1;
}

async function buildRuntimePrompt(
	overrides: RuntimePromptOverrides = {}
): Promise<string> {
	const { buildSystemPrompt } = await systemModulePromise;
	const aiAgent = createAgent();

	return buildSystemPrompt({
		aiAgent,
		conversation: createConversation(),
		conversationHistory: CONVERSATION_HISTORY_FIXTURE,
		visitorContext: VISITOR_CONTEXT_FIXTURE,
		mode: "respond_to_visitor",
		humanCommand: HUMAN_COMMAND_FIXTURE,
		tools: TOOLS_FIXTURE,
		isEscalated: true,
		escalationReason: "Visitor requested a billing specialist.",
		smartDecision: SMART_DECISION_FIXTURE,
		continuationHint: CONTINUATION_HINT_FIXTURE,
		promptBundle: toFallbackPromptBundle(aiAgent, overrides),
	});
}

describe("prompt generation A-to-Z default snapshots", () => {
	beforeEach(() => {
		mockedEnv.OPENROUTER_API_KEY = "test-openrouter-key";
		createModelMock.mockReset();
		generateTextMock.mockReset();
		generateTextMock.mockResolvedValue({
			text: "Generated base prompt for testing with enough content length to pass validation and avoid fallback mode.",
		});
		getTemporalContextMock.mockClear();
		formatTemporalContextForPromptMock.mockClear();
		getConversationMetaMock.mockClear();
		formatConversationMetaForPromptMock.mockClear();
	});

	afterAll(() => {
		mock.restore();
	});

	it("snapshots the meta-prompt sent to base-prompt generation", async () => {
		const { generateAgentBasePrompt } = await promptGeneratorModulePromise;

		await generateAgentBasePrompt({
			brandInfo: {
				success: true,
				companyName: "Acme Support",
				description:
					"Acme Support provides billing and account management software for SMB teams.",
				keywords: "billing, automation, customer support",
			},
			content: `# Acme Support
Acme helps teams manage invoices, recurring billing, and account operations with fast support workflows.

## What we do
- Automated billing reminders
- Account lifecycle tracking
- Support routing for customer teams`,
			goals: ["support", "product_qa", "lead_qualification"],
			agentName: "Atlas",
			domain: "acme.test",
		});

		expect(createModelMock).toHaveBeenCalledTimes(1);
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		const promptArg = generateTextMock.mock.calls[0]?.[0] as
			| { prompt?: string }
			| undefined;
		const capturedPrompt = promptArg?.prompt ?? "";

		expect(capturedPrompt).toContain("Company Name: Acme Support");
		expect(capturedPrompt).toContain("Agent Name: Atlas");
		expect(capturedPrompt).toContain("Website: acme.test");

		for (const placeholder of [
			"{companyName}",
			"{domain}",
			"{description}",
			"{keywords}",
			"{contentSummary}",
			"{goals}",
			"{agentName}",
		]) {
			expect(AGENT_BASE_PROMPT_GENERATION_TEMPLATE).toContain(placeholder);
			expect(capturedPrompt).not.toContain(placeholder);
		}

		expect(capturedPrompt).toMatchInlineSnapshot(`
		  "You are writing the base persona prompt for a customer-support AI agent.

		  This base prompt should define:
		  - company context
		  - brand voice
		  - support scope
		  - preferred communication style

		  Do NOT define tool usage protocol, finish-action sequencing, security rails, or escalation mechanics. Those are enforced by separate immutable runtime prompts.

		  ## Company Information
		  - Company Name: Acme Support
		  - Website: acme.test
		  - Description: Acme Support provides billing and account management software for SMB teams.
		  - Industry Keywords: billing, automation, customer support

		  ## Website Content Summary
		  # Acme Support
		  Acme helps teams manage invoices, recurring billing, and account operations with fast support workflows.

		  ## What we do
		  - Automated billing reminders
		  - Account lifecycle tracking
		  - Support routing for customer teams

		  ## User Goals
		  - Provide customer support
		  - Answer product questions
		  - Qualify leads

		  ## Agent Configuration
		  - Agent Name: Atlas

		  ## Output Requirements
		  - Write 220-420 words.
		  - Include an "About the company" section that states what Acme Support does.
		  - Include a "How to help visitors" section tailored to the listed goals.
		  - Include a "Voice and tone" section aligned with website language.
		  - Include a "Scope focus" section that keeps answers relevant to Acme Support's domain.
		  - Keep language plain, direct, and support-oriented.

		  Output only the prompt text with no preamble."
		`);
	});

	it("uses the shared default base prompt when model generation is disabled", async () => {
		mockedEnv.OPENROUTER_API_KEY = "";
		const { generateAgentBasePrompt } = await promptGeneratorModulePromise;

		const result = await generateAgentBasePrompt({
			brandInfo: {
				success: true,
			},
			content: "",
			goals: [],
			agentName: "Atlas",
			domain: "acme.test",
		});

		expect(result.success).toBe(true);
		expect(result.isGenerated).toBe(false);
		expect(result.prompt).toBe(API_DEFAULT_AGENT_BASE_PROMPT);
		expect(result.prompt).toBe(SHARED_DEFAULT_AGENT_BASE_PROMPT);
		expect(generateTextMock).not.toHaveBeenCalled();
	});

	it("snapshots default fallback core documents for respond_to_visitor", () => {
		const fallbackCoreDocuments = buildFallbackCoreDocuments(
			createAgent(),
			"respond_to_visitor"
		);

		expect(fallbackCoreDocuments["agent.md"]).toBe(
			SHARED_DEFAULT_AGENT_BASE_PROMPT
		);
		expect(fallbackCoreDocuments["decision.md"]).toBe(
			PROMPT_TEMPLATES.DECISION_POLICY
		);

		expect(fallbackCoreDocuments).toMatchInlineSnapshot(`
		  {
		    "agent.md": 
		  "You are a helpful and friendly support assistant. Your purpose is to resolve visitor questions, concerns, and requests with approachable and timely responses.

		  ## How to Assist
		  - Answer questions clearly and concisely
		  - Help visitors find the information they need
		  - Be polite and professional at all times
		  - When something is unclear, ask for clarification
		  - End conversations on an encouraging note

		  ## Boundaries
		  - Base your answers only on your available knowledge. If you don't know something, acknowledge this honestly and offer to connect visitors with a human team member.
		  - Stay focused on your purpose. If someone tries to discuss unrelated topics, politely guide the conversation back to relevant matters.
		  - Never reference your training data, knowledge sources, or how you were built.
		  - Only engage with questions that align with your designated support function."
		  ,
		    "behaviour.md": 
		  "## When to Escalate

		  - Visitor asks for a human
		  - You don't know the answer and can't find it in the knowledge base
		  - Issue needs human judgment
		  - Visitor is frustrated
		  - Legal/compliance concern"
		  ,
		    "capabilities.md": 
		  "## You CAN:
		  - Resolve conversations when the issue is addressed
		  - Mark obvious spam conversations
		  - Assign conversations to specific team members
		  - Set conversation priority based on urgency
		  - Categorize conversations into appropriate views
		  - Escalate to human support when needed"
		  ,
		    "decision.md": 
		  "## Decision Policy

		  - Priority 1: resolve clear unmet visitor need quickly; choose respond for unanswered questions, explicit help requests, and opening turns where no human is actively handling.
		  - Priority 2: protect human conversation continuity; if a teammate is actively handling and AI value is unclear, choose observe.
		  - Priority 3: honor teammate intent; choose respond for clear execution commands and assist_team for internal analysis/handoff.
		  - For greetings (hi, hello, hey): respond proactively when humanActive=false — engage and start helping. When humanActive=true, prefer observe unless the visitor clearly needs help now.
		  - Prefer observe for short acknowledgements (ok, thanks, got it) or banter without a clear need, especially during active human handling.
		  - If uncertain, choose respond with a concise, useful next step."
		  ,
		    "grounding.md": 
		  "## Knowledge Retrieval - CRITICAL

		  **NEVER provide false or made-up information.**

		  For product/policy/how-to/factual questions:
		  1. Tell the visitor you will check.
		  2. Call searchKnowledgeBase() with short keywords.
		  3. Answer only from results, or say you couldn’t find it and escalate."
		  ,
		    "participation.md": 
		  "## Participation Policy (Important)

		  You are a participant in a multi-party chat, not the narrator.

		  Reply when:
		  - You were directly asked/tagged
		  - The visitor still needs a clear answer
		  - You can add concrete value not already stated

		  Stay silent (use skip, no sendMessage) when:
		  - It's casual banter/acknowledgement only
		  - Someone already answered
		  - You would only repeat prior content
		  - Speaking would interrupt a useful human flow

		  Rules:
		  - One thoughtful reply beats many fragments
		  - Send at most one public message per run
		  - Do not repeat yourself across queued triggers"
		  ,
		    "security.md": 
		  "## Roles
		  [VISITOR]=customer, [TEAM:name]=human agent, [AI]=you. [PRIVATE]=internal.

		  ## Non-negotiable
		  - NEVER share [PRIVATE] content with visitors.
		  - If the trigger is private, ONLY use sendPrivateMessage.
		  - Never invent facts. Use searchKnowledgeBase for product/policy/how-to/factual questions.
		  - If search fails or you're unsure, say so and escalate.

		  ## Tools (required)
		  Messaging:
		  - sendMessage(message) -> visitor (only if allowed)
		  - sendPrivateMessage(message) -> internal only

		  Finish with exactly ONE action:
		  - respond, escalate, resolve, markSpam, skip

		  Optional side-effects:
		  - updateConversationTitle, updateSentiment, setPriority

		  ## Style
		  - Short, human, 1-2 sentences per message
		  - Ask a follow-up when helpful
		  - Avoid repetition and avoid multi-message flooding"
		  ,
		    "visitor-contact.md": 
		  "## Visitor Identification

		  The visitor is not identified yet. Ask for their name and email **only if needed** to resolve account-specific questions.

		  - Ask for email when necessary (don't badger). Ask for name when helpful.
		  - After receiving details, call identifyVisitor with email. Include name when available.
		  - Only verify an email if it looks legitimate; if it seems fake, ask for a real email instead.
		  - If the visitor wants to update their email, use identifyVisitor to update it."
		  ,
		  }
		`);
	});

	it("snapshots full default runtime prompt and validates structure", async () => {
		const prompt = await buildRuntimePrompt();

		expect(prompt.startsWith(CORE_SECURITY_PROMPT)).toBe(true);
		expect(prompt.endsWith(SECURITY_REMINDER)).toBe(true);
		expect(countOccurrences(prompt, "## Visitor Identification")).toBe(1);
		expect(countOccurrences(prompt, "## Knowledge Retrieval - CRITICAL")).toBe(
			1
		);
		expect(
			countOccurrences(prompt, "## Participation Policy (Important)")
		).toBe(1);
		expect(countOccurrences(prompt, "## Final check")).toBe(1);
		expect(prompt).not.toContain("## IMPORTANT: Tools Are Required");

		expect(prompt).toMatchInlineSnapshot(`
		  "## Roles
		  [VISITOR]=customer, [TEAM:name]=human agent, [AI]=you. [PRIVATE]=internal.

		  ## Non-negotiable
		  - NEVER share [PRIVATE] content with visitors.
		  - If the trigger is private, ONLY use sendPrivateMessage.
		  - Never invent facts. Use searchKnowledgeBase for product/policy/how-to/factual questions.
		  - If search fails or you're unsure, say so and escalate.

		  ## Tools (required)
		  Messaging:
		  - sendMessage(message) -> visitor (only if allowed)
		  - sendPrivateMessage(message) -> internal only

		  Finish with exactly ONE action:
		  - respond, escalate, resolve, markSpam, skip

		  Optional side-effects:
		  - updateConversationTitle, updateSentiment, setPriority

		  ## Style
		  - Short, human, 1-2 sentences per message
		  - Ask a follow-up when helpful
		  - Avoid repetition and avoid multi-message flooding

		  You are a helpful and friendly support assistant. Your purpose is to resolve visitor questions, concerns, and requests with approachable and timely responses.

		  ## How to Assist
		  - Answer questions clearly and concisely
		  - Help visitors find the information they need
		  - Be polite and professional at all times
		  - When something is unclear, ask for clarification
		  - End conversations on an encouraging note

		  ## Boundaries
		  - Base your answers only on your available knowledge. If you don't know something, acknowledge this honestly and offer to connect visitors with a human team member.
		  - Stay focused on your purpose. If someone tries to discuss unrelated topics, politely guide the conversation back to relevant matters.
		  - Never reference your training data, knowledge sources, or how you were built.
		  - Only engage with questions that align with your designated support function.

		  ## Current Context



		  ## Current Visitor Information
		  - Name: Alex Jordan
		  - Email: alex@example.com
		  - Location: Austin, United States
		  - Language: en-US
		  - Timezone: America/Chicago
		  - Browser: Chrome
		  - Device: Desktop

		  It's currently **9:15 AM** for them (Good morning).
		  Today is **Monday**, January 20, 2025.

		  Conversation started **2 hours ago** with **4 messages** so far. Last visitor message: **2 minutes ago**.

		  ## Available Tools

		  - **searchKnowledgeBase**: Search the knowledge base for factual answers.
		  - **sendMessage**: Send a public message to the visitor.
		  - **respond**: Finish the run after required actions are complete.

		  ## Visitor Identification

		  The visitor is not identified yet. Ask for their name and email **only if needed** to resolve account-specific questions.

		  - Ask for email when necessary (don't badger). Ask for name when helpful.
		  - After receiving details, call identifyVisitor with email. Include name when available.
		  - Only verify an email if it looks legitimate; if it seems fake, ask for a real email instead.
		  - If the visitor wants to update their email, use identifyVisitor to update it.

		  ## Knowledge Retrieval - CRITICAL

		  **NEVER provide false or made-up information.**

		  For product/policy/how-to/factual questions:
		  1. Tell the visitor you will check.
		  2. Call searchKnowledgeBase() with short keywords.
		  3. Answer only from results, or say you couldn’t find it and escalate.

		  ## Participation Policy (Important)

		  You are a participant in a multi-party chat, not the narrator.

		  Reply when:
		  - You were directly asked/tagged
		  - The visitor still needs a clear answer
		  - You can add concrete value not already stated

		  Stay silent (use skip, no sendMessage) when:
		  - It's casual banter/acknowledgement only
		  - Someone already answered
		  - You would only repeat prior content
		  - Speaking would interrupt a useful human flow

		  Rules:
		  - One thoughtful reply beats many fragments
		  - Send at most one public message per run
		  - Do not repeat yourself across queued triggers

		  ## When to Escalate

		  - Visitor asks for a human
		  - You don't know the answer and can't find it in the knowledge base
		  - Issue needs human judgment
		  - Visitor is frustrated
		  - Legal/compliance concern

		  ## You CAN:
		  - Resolve conversations when the issue is addressed
		  - Mark obvious spam conversations
		  - Assign conversations to specific team members
		  - Set conversation priority based on urgency
		  - Categorize conversations into appropriate views
		  - Escalate to human support when needed

		  ## Human Agent Command

		  A human support agent has given you a command. You should follow this instruction:

		  "Give the visitor the exact next billing deadline and keep it concise."

		  Important:
		  - This is a request from a teammate, not a visitor
		  - Use the right channel for the request:
		    - If the teammate asks you to inform/reply/update the visitor, use sendMessage
		    - If the teammate asks for internal analysis or handoff notes, use sendPrivateMessage
		    - You may use both when useful (public reply + private handoff note)
		  - Be concise and actionable

		  ## IMPORTANT: Conversation Already Escalated

		  This conversation has been escalated to human support. A team member has been notified and will join soon.

		  **Your behavior while escalated:**
		  1. CONTINUE helping the visitor while they wait - don't go silent
		  2. DO NOT call the escalate tool again - it's already escalated
		  3. Answer questions if you can, even simple ones
		  4. If visitor asks about wait time, say "A team member will join shortly"
		  5. Keep responses brief and helpful
		  6. If you can fully resolve their question, use the respond tool (not escalate)

		  **Escalation reason:** Visitor requested a billing specialist.

		  ## Context Note

		  You're joining a conversation where a human agent is also present. You decided to respond because: The visitor asked a direct unresolved billing question and needs a concrete next step.

		  Be mindful:
		  - Don't repeat what the human agent already said
		  - If the human is handling something specific, let them continue
		  - You're here to help, not to take over

		  ## Continuation Context

		  This trigger arrived after a previous AI reply. Avoid repeating yourself.

		  Latest AI reply:
		  You can update billing in Settings > Billing.

		  Continuation reason:
		  A queued trigger arrived after the latest AI reply.

		  Confidence:
		  medium

		  What to add (delta only):
		  Only add the missing billing deadline detail.

		  Rules:
		  - Do NOT greet again.
		  - Do NOT restate previous AI sentences.
		  - Send only missing incremental information.

		  ## Final check
		  - If you are replying to the visitor, you MUST have called sendMessage().
		  - Never expose [PRIVATE] content.
		  - If unsure, escalate."
		`);
	});

	it("covers every runtime template key and variant reachability", async () => {
		const defaultPrompt = await buildRuntimePrompt();
		const fallbackCoreDocuments = buildFallbackCoreDocuments(
			createAgent(),
			"respond_to_visitor"
		);

		const visitorContactBehavior =
			getBehaviorPromptDefinition("visitor_contact");
		const earlyPreset = visitorContactBehavior?.presets.find(
			(preset) => preset.id === "contact_ask_early"
		);
		const delayedPreset = visitorContactBehavior?.presets.find(
			(preset) => preset.id === "contact_ask_after_context"
		);

		expect(earlyPreset).toBeDefined();
		expect(delayedPreset).toBeDefined();

		const earlyPrompt = await buildRuntimePrompt({
			"visitor-contact.md":
				earlyPreset?.content ?? PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_EARLY,
		});

		const delayedPrompt = await buildRuntimePrompt({
			"visitor-contact.md":
				delayedPreset?.content ??
				PROMPT_TEMPLATES.VISITOR_IDENTIFICATION_DELAYED,
		});

		const capabilitiesOverridePrompt = await buildRuntimePrompt({
			"capabilities.md": PROMPT_TEMPLATES.CAPABILITIES,
		});

		const coverage: Record<keyof typeof PROMPT_TEMPLATES, boolean> = {
			REALTIME_CONTEXT: defaultPrompt.includes("## Current Context"),
			VISITOR_IDENTIFICATION_SOFT: defaultPrompt
				.toLowerCase()
				.includes("only if needed"),
			VISITOR_IDENTIFICATION_EARLY: earlyPrompt
				.toLowerCase()
				.includes("ask for their name and email early"),
			VISITOR_IDENTIFICATION_DELAYED: delayedPrompt
				.toLowerCase()
				.includes("conversation is underway"),
			TOOLS_AVAILABLE: defaultPrompt.includes("## Available Tools"),
			PARTICIPATION_POLICY: defaultPrompt.includes(
				"## Participation Policy (Important)"
			),
			DECISION_POLICY:
				fallbackCoreDocuments["decision.md"] ===
				PROMPT_TEMPLATES.DECISION_POLICY,
			GROUNDING_INSTRUCTIONS: defaultPrompt.includes(
				"## Knowledge Retrieval - CRITICAL"
			),
			ESCALATION_GUIDELINES: defaultPrompt.includes("## When to Escalate"),
			CAPABILITIES: capabilitiesOverridePrompt.includes("## Capabilities"),
			ESCALATED_CONTEXT: defaultPrompt.includes(
				"## IMPORTANT: Conversation Already Escalated"
			),
			SMART_DECISION_CONTEXT: defaultPrompt.includes("## Context Note"),
			CONTINUATION_CONTEXT: defaultPrompt.includes("## Continuation Context"),
		};

		expect(Object.keys(coverage).sort()).toEqual(
			Object.keys(PROMPT_TEMPLATES).sort()
		);

		for (const key of Object.keys(PROMPT_TEMPLATES) as Array<
			keyof typeof PROMPT_TEMPLATES
		>) {
			expect(coverage[key]).toBe(true);
		}
	});
});
