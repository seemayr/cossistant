import { describe, expect, it } from "bun:test";
import {
	assertCorePromptDocumentName,
	assertSkillPromptDocumentName,
	extractSkillReferencesFromCapabilities,
	isCorePromptDocumentName,
	isValidSkillPromptDocumentName,
	PromptDocumentValidationError,
} from "./documents";

describe("prompt document rules", () => {
	it("accepts reserved core document names", () => {
		expect(isCorePromptDocumentName("capabilities.md")).toBe(true);
		expect(isCorePromptDocumentName("decision.md")).toBe(true);
		expect(() => assertCorePromptDocumentName("capabilities.md")).not.toThrow();
		expect(() => assertCorePromptDocumentName("decision.md")).not.toThrow();
	});

	it("rejects non-core names for core documents", () => {
		expect(() => assertCorePromptDocumentName("custom.md")).toThrow(
			PromptDocumentValidationError
		);
	});

	it("validates strict skill file naming and reserved names", () => {
		expect(isValidSkillPromptDocumentName("refund-workflow.md")).toBe(true);
		expect(isValidSkillPromptDocumentName("Capable.md")).toBe(false);
		expect(isValidSkillPromptDocumentName("capabilities.md")).toBe(false);
		expect(isValidSkillPromptDocumentName("decision.md")).toBe(false);
		expect(() => assertSkillPromptDocumentName("capabilities.md")).toThrow(
			PromptDocumentValidationError
		);
		expect(() => assertSkillPromptDocumentName("decision.md")).toThrow(
			PromptDocumentValidationError
		);
	});

	it("extracts referenced skill filenames from capabilities markdown", () => {
		const references = extractSkillReferencesFromCapabilities(`
+## Skills
+- refunds-refund-policy.md
+- bad_name.MD
+- escalation-playbook.md
+`);

		expect(references).toEqual([
			"refunds-refund-policy.md",
			"escalation-playbook.md",
		]);
	});
});
