"use client";

export type AiPauseAction =
	| "pause_10m"
	| "pause_1h"
	| "pause_further_notice"
	| "resume_now";

export const AI_PAUSE_STATUS_VALUE = "__status";

const AI_PAUSE_INDEFINITE_THRESHOLD_MINUTES = 60 * 24 * 365 * 90;

export function mapAiPauseSelectValueToAction(
	value: string
): AiPauseAction | null {
	switch (value) {
		case "pause_10m":
		case "pause_1h":
		case "pause_further_notice":
		case "resume_now":
			return value;
		default:
			return null;
	}
}

export function getAiPauseStatusLabel(
	aiPausedUntil: string | null | undefined,
	nowMs: number = Date.now()
): string {
	if (!aiPausedUntil) {
		return "AI can answer to conversation";
	}

	const pauseUntilMs = Date.parse(aiPausedUntil);
	if (Number.isNaN(pauseUntilMs) || pauseUntilMs <= nowMs) {
		return "AI can answer to conversation";
	}

	const remainingMinutes = Math.max(
		1,
		Math.ceil((pauseUntilMs - nowMs) / 60_000)
	);
	if (remainingMinutes >= AI_PAUSE_INDEFINITE_THRESHOLD_MINUTES) {
		return "AI answers paused";
	}

	return `AI answers will resume in ${remainingMinutes}-min`;
}

export function getAiPauseMenuActions(isPaused: boolean): AiPauseAction[] {
	if (isPaused) {
		return ["resume_now", "pause_10m", "pause_1h", "pause_further_notice"];
	}

	return ["pause_10m", "pause_1h", "pause_further_notice"];
}

export function getAiPauseActionLabel(action: AiPauseAction): string {
	switch (action) {
		case "resume_now":
			return "Resume AI answers now";
		case "pause_10m":
			return "Pause for 10-min";
		case "pause_1h":
			return "Pause for 1-hour";
		case "pause_further_notice":
			return "Pause until further notice";
		default:
			return action;
	}
}
