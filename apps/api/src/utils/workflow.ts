import { env } from "@api/env";
import type { WorkflowDataMap } from "@api/workflows/types";
import { Client, type TriggerOptions } from "@upstash/workflow";

const client = new Client({
	token: env.QSTASH_TOKEN,
});

type TriggerWorkflowParams<
        T extends keyof WorkflowDataMap = keyof WorkflowDataMap,
> = {
        path: T;
        data: WorkflowDataMap[T];
        options?: Pick<
                TriggerOptions,
                "delay" | "workflowRunId" | "keepTriggerConfig" | "label"
        >;
};

export const triggerWorkflow = async <T extends keyof WorkflowDataMap>({
        path,
        data,
        options,
}: TriggerWorkflowParams<T>) => {
        await client.trigger({
                url: `${env.BETTER_AUTH_URL}/workflow/${path}`,
                headers: {
                        "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
                ...options,
        });
};

export const cancelWorkflowRun = async (workflowRunId: string) => {
        try {
                await client.cancel({ ids: workflowRunId });
        } catch (error) {
                console.warn("Failed to cancel workflow run", {
                        workflowRunId,
                        error,
                });
        }
};
