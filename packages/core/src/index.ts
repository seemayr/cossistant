export type {
  CossistantConfig,
  CossistantError,
  Message,
  PublicWebsiteResponse,
} from "@cossistant/types";

export { conversationSchema, messageSchema } from "@cossistant/types";
export { CossistantClient, CossistantClient as default } from "./client";
export { normalizeLocale } from "./locale-utils";
export { CossistantRestClient } from "./rest-client";
export {
  type ConversationPagination,
  type ConversationsState,
  type ConversationsStore,
  createConversationsStore,
  getConversationById,
  getConversationPagination,
  getConversations,
} from "./store/conversations-store";
export {
  type ConversationMessagesState,
  createMessagesStore,
  getConversationMessages,
  type MessagesState,
  type MessagesStore,
} from "./store/messages-store";
export {
  applyConversationSeenEvent,
  type ConversationSeenState,
  createSeenStore,
  hydrateConversationSeen,
  type SeenActorType,
  type SeenEntry,
  type SeenState,
  type SeenStore,
  upsertConversationSeen,
} from "./store/seen-store";
export {
  createSupportStore,
  type NavigationState,
  type SUPPORT_PAGES,
  type SupportConfig,
  type SupportNavigation,
  type SupportStore,
  type SupportStoreActions,
  type SupportStoreOptions,
  type SupportStoreState,
  type SupportStoreStorage,
} from "./store/support-store";
export {
  applyConversationTypingEvent,
  type ConversationTypingState,
  clearTypingFromMessage,
  clearTypingState,
  createTypingStore,
  getConversationTyping,
  setTypingState,
  type TypingActorType,
  type TypingEntry,
  type TypingState,
  type TypingStore,
  type TypingStoreDependencies,
} from "./store/typing-store";
export {
  createConversationEventsStore,
  type ConversationEventsState,
  type ConversationEventsStore,
} from "./store/conversation-events-store";
export {
  createWebsiteStore,
  getWebsiteState,
  type WebsiteError,
  type WebsiteState,
  type WebsiteStatus,
  type WebsiteStore,
} from "./store/website-store";
// Core-specific exports
export { CossistantAPIError } from "./types";
// Utility exports
export { generateConversationId, generateMessageId } from "./utils";
export { collectVisitorData, type VisitorData } from "./visitor-data";
export {
  clearAllVisitorIds,
  clearVisitorId,
  getVisitorId,
  setVisitorId,
} from "./visitor-tracker";
// WebSocket client removed - use React WebSocket context instead
