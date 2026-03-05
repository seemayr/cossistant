import type { AiAgentPromptDocumentKind } from "@api/db/schema/ai-agent-prompt-document";

export const CORE_PROMPT_DOCUMENT_NAMES = [
	"agent.md",
	"security.md",
	"behaviour.md",
	"visitor-contact.md",
	"participation.md",
	"decision.md",
	"grounding.md",
	"capabilities.md",
] as const;

export type CorePromptDocumentName =
	(typeof CORE_PROMPT_DOCUMENT_NAMES)[number];

export const RESERVED_CORE_PROMPT_DOCUMENT_NAMES = new Set<string>(
	CORE_PROMPT_DOCUMENT_NAMES
);

export const EDITABLE_CORE_PROMPT_DOCUMENT_NAMES = [
	"behaviour.md",
	"participation.md",
	"grounding.md",
	"capabilities.md",
	"visitor-contact.md",
	"decision.md",
] as const;

export const EDITABLE_CORE_PROMPT_DOCUMENT_NAME_SET = new Set<string>(
	EDITABLE_CORE_PROMPT_DOCUMENT_NAMES
);

/**
 * Backward-compatible aliases kept while behavior-specific studio endpoints
 * remain available as wrappers around the generic core prompt studio.
 */
export const EDITABLE_BEHAVIOR_CORE_PROMPT_DOCUMENT_NAMES =
	EDITABLE_CORE_PROMPT_DOCUMENT_NAMES;
export const EDITABLE_BEHAVIOR_CORE_PROMPT_DOCUMENT_NAME_SET =
	EDITABLE_CORE_PROMPT_DOCUMENT_NAME_SET;

export const SKILL_PROMPT_NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,62}\.md$/;

export class PromptDocumentValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PromptDocumentValidationError";
	}
}

export class PromptDocumentConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PromptDocumentConflictError";
	}
}

export function normalizePromptDocumentName(name: string): string {
	return name.trim().toLowerCase();
}

export function isCorePromptDocumentName(
	name: string
): name is CorePromptDocumentName {
	return RESERVED_CORE_PROMPT_DOCUMENT_NAMES.has(name);
}

export function isValidSkillPromptDocumentName(name: string): boolean {
	if (!SKILL_PROMPT_NAME_REGEX.test(name)) {
		return false;
	}

	if (RESERVED_CORE_PROMPT_DOCUMENT_NAMES.has(name)) {
		return false;
	}

	return true;
}

export function assertCorePromptDocumentName(
	name: string
): asserts name is CorePromptDocumentName {
	if (!isCorePromptDocumentName(name)) {
		throw new PromptDocumentValidationError(
			`Core document name must be one of: ${CORE_PROMPT_DOCUMENT_NAMES.join(", ")}`
		);
	}
}

export function assertSkillPromptDocumentName(name: string): void {
	if (!isValidSkillPromptDocumentName(name)) {
		throw new PromptDocumentValidationError(
			"Skill name must match ^[a-z0-9][a-z0-9-]{1,62}\\.md$ and cannot use reserved core names"
		);
	}
}

export function assertPromptDocumentKind(
	kind: string
): asserts kind is AiAgentPromptDocumentKind {
	if (!(kind === "core" || kind === "skill")) {
		throw new PromptDocumentValidationError(
			"Prompt document kind must be 'core' or 'skill'"
		);
	}
}

export function isUniqueViolation(
	error: unknown,
	constraintName?: string
): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const code = "code" in error ? String(error.code) : null;
	const message = "message" in error ? String(error.message) : "";

	if (code !== "23505") {
		return false;
	}

	if (!constraintName) {
		return true;
	}

	return message.includes(constraintName);
}
