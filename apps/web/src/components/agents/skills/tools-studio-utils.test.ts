import { describe, expect, it } from "bun:test";
import {
	buildBehaviorSettingsPatch,
	normalizeSkillFileName,
} from "./tools-studio-utils";

describe("tools-studio-utils", () => {
	it("maps each toggle key to the expected behavior setting patch", () => {
		expect(buildBehaviorSettingsPatch("canResolve", true)).toEqual({
			canResolve: true,
		});
		expect(buildBehaviorSettingsPatch("canMarkSpam", false)).toEqual({
			canMarkSpam: false,
		});
		expect(buildBehaviorSettingsPatch("canSetPriority", true)).toEqual({
			canSetPriority: true,
		});
		expect(buildBehaviorSettingsPatch("canEscalate", false)).toEqual({
			canEscalate: false,
		});
		expect(buildBehaviorSettingsPatch("autoGenerateTitle", true)).toEqual({
			autoGenerateTitle: true,
		});
		expect(buildBehaviorSettingsPatch("autoAnalyzeSentiment", false)).toEqual({
			autoAnalyzeSentiment: false,
		});
	});

	it("normalizes skill names to kebab-case markdown filenames", () => {
		expect(normalizeSkillFileName("Refund Playbook")).toBe(
			"refund-playbook.md"
		);
		expect(normalizeSkillFileName("custom-skill.md")).toBe("custom-skill.md");
		expect(normalizeSkillFileName("  ")).toBe("");
	});
});
