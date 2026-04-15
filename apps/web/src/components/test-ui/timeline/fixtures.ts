import type {
	AvailableAIAgent,
	AvailableHumanAgent,
	ConversationHeader,
} from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { ToolTimelineLogType } from "@cossistant/types/tool-timeline-policy";
import type { TestDashboardTypingActor } from "./dashboard-conversation-timeline-list";
import type { TestWidgetTypingActor } from "./widget-conversation-timeline-list";

export const TEST_UI_CONVERSATION_ID = "01JGCONV11111111111111111";
export const TEST_UI_ORGANIZATION_ID = "01JGORG11111111111111111";
export const TEST_UI_VISITOR_ID = "01JGVIS22222222222222222";
export const TEST_UI_USER_ID = "01JGUSER1111111111111111";
export const TEST_UI_AI_AGENT_ID = "01JGAIA11111111111111111";

export const TEST_UI_VISITOR = {
	id: TEST_UI_VISITOR_ID,
	lastSeenAt: "2026-04-14T09:58:00.000Z",
	blockedAt: null,
	blockedByUserId: null,
	isBlocked: false,
	contact: {
		id: "01JGCON22222222222222222",
		name: "Olivia Parker",
		email: "olivia@patchbay.fm",
		image: null,
	},
} satisfies ConversationHeader["visitor"];

export const TEST_UI_AVAILABLE_HUMAN_AGENTS: AvailableHumanAgent[] = [
	{
		id: TEST_UI_USER_ID,
		name: "Anthony Riera",
		email: "anthony@example.com",
		image: "https://github.com/rieranthony.png",
		lastSeenAt: "2026-04-14T09:58:00.000Z",
	},
];

export const TEST_UI_AVAILABLE_AI_AGENTS: AvailableAIAgent[] = [
	{
		id: TEST_UI_AI_AGENT_ID,
		name: "Cossistant AI",
		image: null,
	},
];

export type TimelineUiPresetId =
	| "messages"
	| "markdown"
	| "attachments"
	| "activity"
	| "widget-tools"
	| "developer"
	| "typing"
	| "mixed";

export type TimelineUiPreset = {
	id: TimelineUiPresetId;
	label: string;
	description: string;
	widgetSupported: boolean;
	isDeveloperModeEnabled: boolean;
	items: TimelineItem[];
	dashboardTypingActors: TestDashboardTypingActor[];
	widgetTypingActors: TestWidgetTypingActor[];
};

const BASE_TIME = new Date("2026-04-14T09:00:00.000Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type TimelineSender = "visitor" | "team" | "ai";

function at(minutes: number, dayOffset = 0): string {
	return new Date(
		BASE_TIME + dayOffset * DAY_MS + minutes * MINUTE_MS
	).toISOString();
}

function senderFields(sender: TimelineSender) {
	switch (sender) {
		case "visitor":
			return {
				userId: null,
				visitorId: TEST_UI_VISITOR_ID,
				aiAgentId: null,
			};
		case "team":
			return {
				userId: TEST_UI_USER_ID,
				visitorId: null,
				aiAgentId: null,
			};
		default:
			return {
				userId: null,
				visitorId: null,
				aiAgentId: TEST_UI_AI_AGENT_ID,
			};
	}
}

function createTextPart(text: string) {
	return {
		type: "text" as const,
		text,
	};
}

function createMessageItem(params: {
	id: string;
	text: string;
	sender: TimelineSender;
	minute: number;
	dayOffset?: number;
	parts?: TimelineItem["parts"];
	visibility?: "public" | "private";
}): TimelineItem {
	return {
		id: params.id,
		conversationId: TEST_UI_CONVERSATION_ID,
		organizationId: TEST_UI_ORGANIZATION_ID,
		visibility: params.visibility ?? "public",
		type: "message",
		text: params.text,
		parts: params.parts ?? [createTextPart(params.text)],
		tool: null,
		createdAt: at(params.minute, params.dayOffset),
		deletedAt: null,
		...senderFields(params.sender),
	};
}

function createEventItem(params: {
	id: string;
	sender: "team" | "ai";
	minute: number;
	dayOffset?: number;
	eventType:
		| "participant_joined"
		| "participant_left"
		| "participant_requested"
		| "resolved"
		| "reopened"
		| "assigned";
}): TimelineItem {
	return {
		id: params.id,
		conversationId: TEST_UI_CONVERSATION_ID,
		organizationId: TEST_UI_ORGANIZATION_ID,
		visibility: "public",
		type: "event",
		text: null,
		tool: null,
		parts: [
			{
				type: "event",
				eventType: params.eventType,
				actorUserId: params.sender === "team" ? TEST_UI_USER_ID : null,
				actorAiAgentId: params.sender === "ai" ? TEST_UI_AI_AGENT_ID : null,
				targetUserId: null,
				targetAiAgentId: null,
				message: null,
			},
		],
		createdAt: at(params.minute, params.dayOffset),
		deletedAt: null,
		...senderFields(params.sender),
	};
}

function createToolItem(params: {
	id: string;
	sender: "team" | "ai";
	minute: number;
	dayOffset?: number;
	toolName: string;
	text: string;
	state?: "partial" | "result" | "error";
	input?: Record<string, unknown>;
	output?: unknown;
	logType?: ToolTimelineLogType;
	visibility?: "public" | "private";
}): TimelineItem {
	const part: TimelineItem["parts"][number] = {
		type: `tool-${params.toolName}`,
		toolCallId: `${params.id}-call`,
		toolName: params.toolName,
		input: params.input ?? {},
		state: params.state ?? "result",
		...(params.output !== undefined ? { output: params.output } : {}),
		...(params.logType
			? {
					providerMetadata: {
						cossistant: {
							toolTimeline: {
								logType: params.logType,
								triggerMessageId: `${params.id}-trigger`,
								workflowRunId: `${params.id}-workflow`,
							},
						},
					},
				}
			: {}),
	};

	return {
		id: params.id,
		conversationId: TEST_UI_CONVERSATION_ID,
		organizationId: TEST_UI_ORGANIZATION_ID,
		visibility: params.visibility ?? "public",
		type: "tool",
		text: params.text,
		tool: params.toolName,
		parts: [part],
		createdAt: at(params.minute, params.dayOffset),
		deletedAt: null,
		...senderFields(params.sender),
	};
}

function createIdentificationItem(params: {
	id: string;
	minute: number;
	dayOffset?: number;
}): TimelineItem {
	return {
		id: params.id,
		conversationId: TEST_UI_CONVERSATION_ID,
		organizationId: TEST_UI_ORGANIZATION_ID,
		visibility: "public",
		type: "identification",
		text: null,
		tool: null,
		parts: [],
		createdAt: at(params.minute, params.dayOffset),
		deletedAt: null,
		...senderFields("ai"),
	};
}

function createSearchOutput(query: string, count = 2) {
	return {
		success: true,
		data: {
			totalFound: count,
			articles:
				count === 0
					? []
					: [
							{
								title: "Billing FAQ",
								sourceUrl: `https://example.com/${query.replace(/\s+/g, "-")}`,
								sourceType: "url",
							},
							{
								title: "Pricing docs",
								sourceUrl: "https://docs.example.com/pricing",
								sourceType: "url",
							},
						],
		},
	};
}

function createDashboardTypingActor(
	actorType: TestDashboardTypingActor["actorType"],
	actorId: string,
	preview: string
): TestDashboardTypingActor {
	return {
		conversationId: TEST_UI_CONVERSATION_ID,
		actorType,
		actorId,
		preview,
	};
}

function createWidgetTypingActor(
	actorType: TestWidgetTypingActor["actorType"],
	actorId: string,
	preview: string
): TestWidgetTypingActor {
	return {
		conversationId: TEST_UI_CONVERSATION_ID,
		actorId,
		actorType,
		preview,
	};
}

const MESSAGE_PRESET_ITEMS = [
	createMessageItem({
		id: "message-visitor-1",
		sender: "visitor",
		minute: 0,
		text: "Hey team, our billing page still shows the old annual discount.",
	}),
	createMessageItem({
		id: "message-visitor-2",
		sender: "visitor",
		minute: 2,
		text: "It only happens on the dashboard route.",
	}),
	createMessageItem({
		id: "message-ai-1",
		sender: "ai",
		minute: 5,
		text: "I checked the latest deploy and I can reproduce it in the dashboard preview.",
	}),
	createMessageItem({
		id: "message-team-1",
		sender: "team",
		minute: 8,
		text: "Thanks, I’m comparing the widget theme tokens now.",
	}),
];

const MARKDOWN_PRESET_ITEMS = [
	createMessageItem({
		id: "markdown-visitor-1",
		sender: "visitor",
		minute: 0,
		text: "Can you show me the command and the snippet you tested?",
	}),
	createMessageItem({
		id: "markdown-ai-1",
		sender: "ai",
		minute: 3,
		text: [
			"Run `pnpm add @cossistant/react` in your terminal.",
			"",
			'```tsx title="app/page.tsx"',
			"export default function Page() {",
			"  return <div>Hello timeline</div>;",
			"}",
			"```",
		].join("\n"),
	}),
];

const ATTACHMENT_PRESET_ITEMS = [
	createMessageItem({
		id: "attachment-visitor-1",
		sender: "visitor",
		minute: 0,
		text: "Here are the screenshots and the billing export.",
		parts: [
			createTextPart("Here are the screenshots and the billing export."),
			{
				type: "image",
				url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&q=80",
				mediaType: "image/jpeg",
				filename: "dashboard-theme-bug.jpg",
				width: 1200,
				height: 800,
			},
			{
				type: "file",
				url: "https://example.com/files/billing-audit.pdf",
				mediaType: "application/pdf",
				filename: "billing-audit.pdf",
				size: 248_000,
			},
		],
	}),
	createMessageItem({
		id: "attachment-team-1",
		sender: "team",
		minute: 4,
		text: "Perfect, I attached the annotated mock too.",
		parts: [
			createTextPart("Perfect, I attached the annotated mock too."),
			{
				type: "image",
				url: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=900&q=80",
				mediaType: "image/jpeg",
				filename: "annotated-mock.jpg",
				width: 1200,
				height: 800,
			},
		],
	}),
];

const ACTIVITY_PRESET_ITEMS = [
	createEventItem({
		id: "activity-event-1",
		sender: "team",
		minute: 0,
		eventType: "participant_joined",
	}),
	createToolItem({
		id: "activity-tool-title",
		sender: "team",
		minute: 1,
		toolName: "updateConversationTitle",
		text: 'Changed title to "Billing theme mismatch"',
	}),
	createToolItem({
		id: "activity-tool-priority",
		sender: "team",
		minute: 3,
		toolName: "setPriority",
		text: "Priority set to high",
	}),
	createToolItem({
		id: "activity-tool-search",
		sender: "ai",
		minute: 9,
		toolName: "searchKnowledgeBase",
		text: 'Searched for "theme token contrast"',
		input: { query: "theme token contrast" },
		output: createSearchOutput("theme token contrast"),
	}),
];

const WIDGET_TOOL_PRESET_ITEMS = [
	createMessageItem({
		id: "widget-tool-message",
		sender: "visitor",
		minute: 0,
		text: "Can you find the docs for support widget colors?",
	}),
	createToolItem({
		id: "widget-tool-search",
		sender: "ai",
		minute: 2,
		toolName: "searchKnowledgeBase",
		text: 'Searched for "support widget colors"',
		input: { query: "support widget colors" },
		output: createSearchOutput("support widget colors"),
	}),
	createIdentificationItem({
		id: "widget-tool-identification",
		minute: 6,
	}),
];

const DEVELOPER_PRESET_ITEMS = [
	createEventItem({
		id: "developer-event-1",
		sender: "team",
		minute: 0,
		eventType: "participant_joined",
	}),
	createToolItem({
		id: "developer-tool-decision",
		sender: "ai",
		minute: 2,
		toolName: "aiDecision",
		text: "Decision trace captured for theme mismatch investigation",
		logType: "decision",
		visibility: "private",
		input: { route: "/dashboard" },
	}),
	createToolItem({
		id: "developer-tool-credit",
		sender: "ai",
		minute: 5,
		toolName: "aiCreditUsage",
		text: "Credits calculated for the dashboard analysis run",
		visibility: "private",
		input: { credits: 42 },
	}),
	createToolItem({
		id: "developer-tool-generation",
		sender: "ai",
		minute: 7,
		toolName: "generationUsage",
		text: "Model usage recorded for the same workflow",
		visibility: "private",
		input: { promptTokens: 512, completionTokens: 234 },
	}),
];

const TYPING_PRESET_ITEMS = [
	createMessageItem({
		id: "typing-message-1",
		sender: "visitor",
		minute: 0,
		text: "The widget looks good, but the dashboard still feels inverted.",
	}),
	createMessageItem({
		id: "typing-message-2",
		sender: "team",
		minute: 4,
		text: "I’m checking both surfaces side by side.",
	}),
];

const MIXED_PRESET_ITEMS = [
	createMessageItem({
		id: "mixed-visitor-day-1",
		sender: "visitor",
		minute: 0,
		dayOffset: -1,
		text: "Yesterday the widget command block looked right, but the dashboard didn’t.",
	}),
	createToolItem({
		id: "mixed-search-day-1",
		sender: "ai",
		minute: 3,
		dayOffset: -1,
		toolName: "searchKnowledgeBase",
		text: 'Searched for "timeline code block theming"',
		input: { query: "timeline code block theming" },
		output: createSearchOutput("timeline code block theming"),
	}),
	createEventItem({
		id: "mixed-event-day-2",
		sender: "team",
		minute: 1,
		dayOffset: 0,
		eventType: "participant_joined",
	}),
	createMessageItem({
		id: "mixed-markdown-day-2",
		sender: "ai",
		minute: 4,
		text: [
			"Run `npm i next` in the sandbox.",
			"",
			'```css title="theme.css"',
			".timeline-code-block { color: var(--foreground); }",
			"```",
		].join("\n"),
	}),
	createMessageItem({
		id: "mixed-attachment-day-2",
		sender: "visitor",
		minute: 7,
		text: "Attaching the screenshot I used to compare both modes.",
		parts: [
			createTextPart("Attaching the screenshot I used to compare both modes."),
			{
				type: "image",
				url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=900&q=80",
				mediaType: "image/jpeg",
				filename: "timeline-compare.jpg",
				width: 1200,
				height: 800,
			},
		],
	}),
];

export const TIMELINE_UI_PRESETS: TimelineUiPreset[] = [
	{
		id: "messages",
		label: "Messages",
		description:
			"Basic sent and received message groups with realistic widths.",
		widgetSupported: true,
		isDeveloperModeEnabled: false,
		items: MESSAGE_PRESET_ITEMS,
		dashboardTypingActors: [],
		widgetTypingActors: [],
	},
	{
		id: "markdown",
		label: "Markdown",
		description:
			"Inline code, fenced code, promoted commands, and formatted text.",
		widgetSupported: true,
		isDeveloperModeEnabled: false,
		items: MARKDOWN_PRESET_ITEMS,
		dashboardTypingActors: [],
		widgetTypingActors: [],
	},
	{
		id: "attachments",
		label: "Attachments",
		description: "Image and file attachments inside real timeline bubbles.",
		widgetSupported: true,
		isDeveloperModeEnabled: false,
		items: ATTACHMENT_PRESET_ITEMS,
		dashboardTypingActors: [],
		widgetTypingActors: [],
	},
	{
		id: "activity",
		label: "Activity",
		description:
			"Public events plus customer-facing activity and tool grouping.",
		widgetSupported: true,
		isDeveloperModeEnabled: false,
		items: ACTIVITY_PRESET_ITEMS,
		dashboardTypingActors: [],
		widgetTypingActors: [],
	},
	{
		id: "widget-tools",
		label: "Widget Tools",
		description:
			"Widget tool rows, knowledge search results, and identification CTA.",
		widgetSupported: true,
		isDeveloperModeEnabled: false,
		items: WIDGET_TOOL_PRESET_ITEMS,
		dashboardTypingActors: [],
		widgetTypingActors: [],
	},
	{
		id: "developer",
		label: "Developer",
		description: "Dashboard-only internal tool logs and decision traces.",
		widgetSupported: false,
		isDeveloperModeEnabled: true,
		items: DEVELOPER_PRESET_ITEMS,
		dashboardTypingActors: [],
		widgetTypingActors: [],
	},
	{
		id: "typing",
		label: "Typing",
		description: "Active typing indicators on both surfaces.",
		widgetSupported: true,
		isDeveloperModeEnabled: false,
		items: TYPING_PRESET_ITEMS,
		dashboardTypingActors: [
			createDashboardTypingActor(
				"visitor",
				TEST_UI_VISITOR_ID,
				"I’m still checking the dark mode version..."
			),
		],
		widgetTypingActors: [
			createWidgetTypingActor(
				"team_member",
				TEST_UI_USER_ID,
				"I’m still checking the dark mode version..."
			),
		],
	},
	{
		id: "mixed",
		label: "Mixed",
		description:
			"A full thread with day changes, markdown, attachments, and tool activity.",
		widgetSupported: true,
		isDeveloperModeEnabled: false,
		items: MIXED_PRESET_ITEMS,
		dashboardTypingActors: [
			createDashboardTypingActor(
				"ai_agent",
				TEST_UI_AI_AGENT_ID,
				"Comparing token outputs..."
			),
		],
		widgetTypingActors: [
			createWidgetTypingActor(
				"ai",
				TEST_UI_AI_AGENT_ID,
				"Comparing token outputs..."
			),
		],
	},
];

export const DEFAULT_TIMELINE_UI_PRESET_ID: TimelineUiPresetId = "messages";

export function getTimelineUiPreset(id: TimelineUiPresetId): TimelineUiPreset {
	const fallbackPreset = TIMELINE_UI_PRESETS[0];
	if (!fallbackPreset) {
		throw new Error("No timeline UI presets configured");
	}

	return (
		TIMELINE_UI_PRESETS.find((preset) => preset.id === id) ?? fallbackPreset
	);
}
