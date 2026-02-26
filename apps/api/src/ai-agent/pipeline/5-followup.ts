/**
 * Pipeline Step 5: Followup
 *
 * This step handles post-processing tasks after the main action is executed.
 *
 * Responsibilities:
 * - Update AI agent usage statistics
 * - Emit realtime events
 * - Run auto-categorization (if enabled)
 *
 * Note: Typing indicator is managed by the pipeline orchestrator (index.ts)
 *
 * Sentiment and title are now handled via SDK tools during generation,
 * not in this followup step.
 */

import type { Database } from "@api/db";
import { updateAiAgentUsage } from "@api/db/queries/ai-agent";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import * as analysis from "../analysis";
import type { AiDecision } from "../output/schemas";
import { getBehaviorSettings } from "../settings";
import type { ExecutionResult } from "./4-execution";

type FollowupInput = {
	db: Database;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	decision: AiDecision | null;
	executionResult: ExecutionResult | null;
};

/**
 * Execute post-processing tasks
 */
export async function followup(input: FollowupInput): Promise<void> {
	const { db, aiAgent, conversation, decision, executionResult } = input;

	// If there was a successful action, update usage stats
	if (executionResult?.primaryAction.success && decision?.action !== "skip") {
		await updateAiAgentUsage(db, { aiAgentId: aiAgent.id });
	}

	// Run auto-categorization if enabled (not yet a tool)
	const settings = getBehaviorSettings(aiAgent);
	if (settings.autoCategorize) {
		analysis
			.autoCategorize({
				db,
				conversation,
				aiAgentId: aiAgent.id,
			})
			.catch((error) => {
				console.error(
					`[ai-agent:followup] conv=${conversation.id} | Auto-categorization failed:`,
					error
				);
			});
	}
}
