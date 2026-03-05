import type { Database } from "@api/db";
import type { GenerationRuntimeResult } from "../../../shared/generation";
import { runGenerationRuntime } from "../../../shared/generation";
import type {
	PipelineToolLogger,
	ToolTracePayloadMode,
} from "../../../shared/tools/contracts";
import type { PrimaryPipelineInput } from "../../contracts";
import type { DecisionResult } from "../decision";
import type { IntakeReadyContext } from "../intake/types";

export async function runPrimaryGenerationStep(params: {
	db: Database;
	pipelineInput: PrimaryPipelineInput;
	intake: IntakeReadyContext;
	decision: DecisionResult;
	startTyping?: () => Promise<void>;
	stopTyping?: () => Promise<void>;
	debugLogger?: PipelineToolLogger;
	deepTraceEnabled?: boolean;
	tracePayloadMode?: ToolTracePayloadMode;
}): Promise<GenerationRuntimeResult> {
	const trigger = params.intake.triggerMessage;

	return runGenerationRuntime({
		db: params.db,
		pipelineKind: "primary",
		mode: params.decision.mode,
		aiAgent: params.intake.aiAgent,
		conversation: params.intake.conversation,
		conversationHistory: params.intake.conversationHistory,
		visitorContext: params.intake.visitorContext,
		conversationState: params.intake.conversationState,
		humanCommand: params.decision.humanCommand,
		workflowRunId: params.pipelineInput.workflowRunId,
		triggerMessageId: params.pipelineInput.messageId,
		triggerMessageCreatedAt: params.pipelineInput.messageCreatedAt,
		triggerSenderType: trigger?.senderType,
		triggerVisibility: trigger?.visibility,
		allowPublicMessages: params.decision.mode !== "background_only",
		startTyping: params.startTyping,
		stopTyping: params.stopTyping,
		debugLogger: params.debugLogger,
		deepTraceEnabled: params.deepTraceEnabled,
		tracePayloadMode: params.tracePayloadMode,
	});
}

export type { GenerationRuntimeResult } from "../../../shared/generation";
