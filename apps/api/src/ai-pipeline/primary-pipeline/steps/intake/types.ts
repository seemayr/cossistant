import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type {
	ConversationState,
	ConversationTranscriptEntry,
	ModelResolution,
	RoleAwareMessage,
	SegmentedConversationEntry,
	SegmentedConversationMessage,
	VisitorContext,
} from "../../contracts";

export type IntakeReadyContext = {
	aiAgent: AiAgentSelect;
	modelResolution: ModelResolution;
	conversation: ConversationSelect;
	websiteDefaultLanguage: string;
	visitorLanguage: string | null;
	autoTranslateEnabled?: boolean;
	conversationHistory: ConversationTranscriptEntry[];
	decisionMessages: SegmentedConversationMessage[];
	generationEntries: SegmentedConversationEntry[];
	visitorContext: VisitorContext | null;
	conversationState: ConversationState;
	triggerMessage: RoleAwareMessage | null;
	triggerMessageText: string | null;
	hasLaterHumanMessage: boolean;
	hasLaterAiMessage: boolean;
};

export type IntakeStepResult =
	| {
			status: "ready";
			data: IntakeReadyContext;
	  }
	| {
			status: "skipped";
			reason: string;
			cursorDisposition: "advance" | "retry";
	  };

export type TriggerMessageMetadata = {
	id: string;
	createdAt: string;
	conversationId: string;
	text: string | null;
};
