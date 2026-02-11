import type { SenderType } from "./enums";

export * from "./api";
export * from "./api/ai-agent-capabilities";
export * from "./enums";
export * from "./presence";
export * from "./realtime-events";
export type { Conversation, ConversationSeen } from "./schemas";
export { conversationSchema, conversationSeenSchema } from "./schemas";
export * from "./tool-timeline-policy";
export * from "./trpc/contact";
export * from "./trpc/conversation";
export * from "./trpc/visitor";

export type CossistantConfig = {
	apiUrl: string;
	wsUrl: string;
	apiKey?: string;
	publicKey?: string;
	userId?: string;
	organizationId?: string;
};

export type CossistantError = {
	code: string;
	message: string;
	details?: Record<string, unknown>;
};

export type DefaultMessage = {
	content: string;
	senderType: SenderType;
	senderId?: string;
};
