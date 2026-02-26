import { emitWorkflowStarted } from "@api/ai-agent/events/workflow";

export async function safeEmitWorkflowStarted(
	params: Parameters<typeof emitWorkflowStarted>[0]
): Promise<void> {
	try {
		await emitWorkflowStarted(params);
	} catch (error) {
		console.warn(
			`[worker:ai-agent] conv=${params.conversation.id} | Failed to emit workflow started event`,
			error
		);
	}
}

export async function runWithWorkflowStartedEvent<T>(params: {
	event: Parameters<typeof emitWorkflowStarted>[0];
	run: () => Promise<T>;
}): Promise<T> {
	await safeEmitWorkflowStarted(params.event);
	return params.run();
}
