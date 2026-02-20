/**
 * Prompts Module
 *
 * Handles prompt engineering for the AI agent.
 */

export {
	CORE_PROMPT_DOCUMENT_NAMES,
	type CorePromptDocumentName,
} from "./documents";
export { buildBehaviorInstructions } from "./instructions";
export { resolvePromptBundle } from "./resolver";
export { CORE_SECURITY_PROMPT, SECURITY_REMINDER } from "./security";
export { buildSystemPrompt } from "./system";
export { PROMPT_TEMPLATES } from "./templates";
