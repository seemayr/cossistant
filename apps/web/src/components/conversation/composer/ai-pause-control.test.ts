import { describe, expect, it } from "bun:test";
import {
	getAiPauseMenuActions,
	getAiPauseStatusLabel,
	mapAiPauseSelectValueToAction,
} from "./index";

describe("ai pause control helpers", () => {
	it("formats pause status labels for active, timed, and indefinite pauses", () => {
		const nowMs = Date.parse("2026-01-01T00:00:00.000Z");
		const resumeSoon = new Date(nowMs + 34 * 60_000).toISOString();
		const furtherNotice = new Date(
			nowMs + 99 * 365 * 24 * 60 * 60 * 1000
		).toISOString();

		expect(getAiPauseStatusLabel(null, nowMs)).toBe(
			"AI can answer to conversation"
		);
		expect(getAiPauseStatusLabel(resumeSoon, nowMs)).toBe(
			"AI answers will resume in 34-min"
		);
		expect(getAiPauseStatusLabel(furtherNotice, nowMs)).toBe(
			"AI answers paused"
		);
	});

	it("shows resume action only while paused", () => {
		expect(getAiPauseMenuActions(false)).toEqual([
			"pause_10m",
			"pause_1h",
			"pause_further_notice",
		]);
		expect(getAiPauseMenuActions(true)).toEqual([
			"resume_now",
			"pause_10m",
			"pause_1h",
			"pause_further_notice",
		]);
	});

	it("maps select values to pause action enums", () => {
		expect(mapAiPauseSelectValueToAction("resume_now")).toBe("resume_now");
		expect(mapAiPauseSelectValueToAction("pause_10m")).toBe("pause_10m");
		expect(mapAiPauseSelectValueToAction("pause_1h")).toBe("pause_1h");
		expect(mapAiPauseSelectValueToAction("pause_further_notice")).toBe(
			"pause_further_notice"
		);
		expect(mapAiPauseSelectValueToAction("unknown")).toBeNull();
	});
});
