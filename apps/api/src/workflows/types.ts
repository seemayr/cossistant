export const WORKFLOW = {
        WAITLIST_JOIN: "waitlist/join",
        WAITLIST_LEAVE: "waitlist/leave",
        CONVERSATION_UNSEEN_DIGEST: "conversations/unseen-digest",
} as const;

// Export data types for use in workflow handlers
export type WaitlistJoinData = {
        userId: string;
        email: string;
        name: string;
};

export type ConversationUnseenDigestData = {
        conversationId: string;
        organizationId: string;
};

export type WorkflowDataMap = {
        [WORKFLOW.WAITLIST_JOIN]: WaitlistJoinData;
        [WORKFLOW.CONVERSATION_UNSEEN_DIGEST]: ConversationUnseenDigestData;
};
