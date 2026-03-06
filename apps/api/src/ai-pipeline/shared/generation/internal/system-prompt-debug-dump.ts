import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { GenerationRuntimeInput } from "../contracts";
import { emitGenerationDebugLog } from "./debug-log";

const SYSTEM_PROMPT_DEBUG_DIR = resolve(
	import.meta.dir,
	"../../../../../debug/system-prompts"
);

export async function writeGenerationSystemPromptDebugDump(params: {
	input: GenerationRuntimeInput;
	systemPrompt: string;
}): Promise<void> {
	if (process.env.NODE_ENV === "production") {
		return;
	}

	const promptDir = join(
		SYSTEM_PROMPT_DEBUG_DIR,
		params.input.conversation.id,
		params.input.triggerMessageId
	);
	const filePath = join(promptDir, "system-prompt.md");

	try {
		await mkdir(promptDir, { recursive: true });
		await writeFile(filePath, params.systemPrompt, "utf8");
	} catch (error) {
		emitGenerationDebugLog(
			params.input,
			"warn",
			`[ai-pipeline:generation] conv=${params.input.conversation.id} workflowRunId=${params.input.workflowRunId} evt=system_prompt_dump_failed`,
			error
		);
	}
}
