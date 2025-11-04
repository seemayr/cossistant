import { WORKFLOW } from "@api/workflows/types";
import { cancelWorkflowRun, triggerWorkflow } from "./workflow";

const CONVERSATION_DIGEST_DELAY_SECONDS = 120;

const getWorkflowRunId = (organizationId: string, conversationId: string) =>
        `conversation-unseen-${organizationId}-${conversationId}`;

export const scheduleConversationUnseenDigest = async (params: {
        conversationId: string;
        organizationId: string;
}) => {
        const workflowRunId = getWorkflowRunId(params.organizationId, params.conversationId);

        await cancelWorkflowRun(workflowRunId);

        await triggerWorkflow({
                path: WORKFLOW.CONVERSATION_UNSEEN_DIGEST,
                data: {
                        conversationId: params.conversationId,
                        organizationId: params.organizationId,
                },
                options: {
                        delay: CONVERSATION_DIGEST_DELAY_SECONDS,
                        workflowRunId,
                        keepTriggerConfig: true,
                        label: `conversation:${params.conversationId}`,
                },
        });
};
