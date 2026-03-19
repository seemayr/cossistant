import { describe, expect, it } from "bun:test";
import {
	buildPrecisionFlowScene,
	getPrecisionFlowRemainingSequence,
	getPrecisionFlowStartPhaseForStep,
	PRECISION_FLOW_FAQ_DRAFT,
	PRECISION_FLOW_INITIAL_PHASE,
	PRECISION_FLOW_QUESTION_ONE_ANSWER,
	PRECISION_FLOW_QUESTION_TWO_ANSWER,
	PRECISION_FLOW_TYPED_QUESTION,
	resetPrecisionFlowPlaybackState,
} from "./precision-flow-demo";

function getFirstToolCallId(scene: ReturnType<typeof buildPrecisionFlowScene>) {
	const part = scene.timelineItems[1]?.parts[0] as
		| { toolCallId?: string }
		| undefined;

	return part?.toolCallId ?? null;
}

describe("precision flow demo model", () => {
	it("resets replay state back to the first highlighted step", () => {
		const resetState = resetPrecisionFlowPlaybackState();
		const scene = buildPrecisionFlowScene(resetState.phase);

		expect(resetState.phase).toBe(PRECISION_FLOW_INITIAL_PHASE);
		expect(scene.activeStepId).toBe("visitor_asks");
	});

	it("starts with the visitor question as a messages-only phase", () => {
		const scene = buildPrecisionFlowScene("visitor_question");

		expect(scene.composerState.kind).toBe("default");
		expect(scene.composerValue).toBe("");
		expect(scene.timelineItems).toHaveLength(1);
		expect(scene.timelineItems[0]?.text).toBe(PRECISION_FLOW_TYPED_QUESTION);
	});

	it("adds marc's question to the timeline instead of the team composer input", () => {
		const scene = buildPrecisionFlowScene("visitor_question");

		expect(scene.composerState.kind).toBe("default");
		expect(scene.composerValue).toBe("");
		expect(
			scene.timelineItems.map((item) => item.text ?? "").join(" ")
		).toContain(PRECISION_FLOW_TYPED_QUESTION);
	});

	it("keeps the opening gap-detection beats messages-only until clarification begins", () => {
		const loadingScene = buildPrecisionFlowScene("gap_search_loading");
		const resultScene = buildPrecisionFlowScene("gap_search_result");
		const handoffScene = buildPrecisionFlowScene("human_handoff");
		const transitionScene = buildPrecisionFlowScene("clarify_transition");
		const promptScene = buildPrecisionFlowScene("clarify_prompt");

		expect(loadingScene.composerState.kind).toBe("default");
		expect(resultScene.composerState.kind).toBe("default");
		expect(handoffScene.composerState.kind).toBe("default");
		expect(transitionScene.composerState.kind).toBe("prompt");
		expect(promptScene.composerState.kind).toBe("prompt");
		expect(loadingScene.timelineItems).toHaveLength(2);
		expect(resultScene.timelineItems).toHaveLength(2);
		expect(transitionScene.timelineItems).toHaveLength(3);
		expect(loadingScene.timelineItems[1]?.id).toBe(
			resultScene.timelineItems[1]?.id
		);
		expect(getFirstToolCallId(loadingScene)).toBe(
			getFirstToolCallId(resultScene)
		);
	});

	it("asks an open clarification before the targeted follow-up", () => {
		const firstQuestionScene = buildPrecisionFlowScene("question_one");
		const nextClickScene = buildPrecisionFlowScene("question_one_next_click");
		const secondQuestionScene = buildPrecisionFlowScene("question_two");
		const selectScene = buildPrecisionFlowScene("question_two_select");

		expect(firstQuestionScene.composerState.kind).toBe("question");
		expect(nextClickScene.composerState.kind).toBe("question");
		expect(secondQuestionScene.composerState.kind).toBe("question");
		expect(selectScene.composerState.kind).toBe("question");

		if (
			firstQuestionScene.composerState.kind !== "question" ||
			nextClickScene.composerState.kind !== "question" ||
			secondQuestionScene.composerState.kind !== "question" ||
			selectScene.composerState.kind !== "question"
		) {
			throw new Error("Expected clarification scenes to be question states");
		}

		expect(firstQuestionScene.composerState.inputMode).toBe("textarea_first");
		expect(firstQuestionScene.composerState.freeAnswer).toBe(
			PRECISION_FLOW_QUESTION_ONE_ANSWER
		);
		expect(firstQuestionScene.composerState.question).toContain(
			"How does account deletion work today?"
		);
		expect(nextClickScene.showQuestionOneNextCursor).toBe(true);
		expect(nextClickScene.composerState.question).toContain(
			"How does account deletion work today?"
		);

		expect(secondQuestionScene.composerState.inputMode).toBe(
			"suggested_answers"
		);
		expect(secondQuestionScene.composerState.selectedAnswer).toBeNull();
		expect(selectScene.showAnswerSelectCursor).toBe(true);
		expect(secondQuestionScene.composerState.question).toContain(
			"Where should the visitor go to start the deletion flow?"
		);
	});

	it("keeps private clarification answers out of the public timeline", () => {
		const scene = buildPrecisionFlowScene("question_two");
		const timelineText = scene.timelineItems
			.map((item) => item.text ?? "")
			.join(" ");

		expect(scene.composerState.kind).toBe("question");
		expect(timelineText).not.toContain(PRECISION_FLOW_QUESTION_ONE_ANSWER);
		expect(timelineText).not.toContain(PRECISION_FLOW_QUESTION_TWO_ANSWER);
		expect(timelineText).toContain(PRECISION_FLOW_TYPED_QUESTION);
		expect(timelineText).toContain('Searching for "delete account"...');
		expect(timelineText).toContain(
			"I don't know this one yet, so I'm asking the team and saving the answer for next time."
		);
		expect(timelineText).not.toContain("Hey there, I can help");
	});

	it("shows explicit cursor phases and ends with a created faq outcome", () => {
		const clarifyScene = buildPrecisionFlowScene("clarify_click");
		const questionOneNextScene = buildPrecisionFlowScene(
			"question_one_next_click"
		);
		const answerSelectScene = buildPrecisionFlowScene("question_two_select");
		const approveScene = buildPrecisionFlowScene("approve_click");
		const finalScene = buildPrecisionFlowScene("faq_created");

		expect(clarifyScene.showClarifyCursor).toBe(true);
		expect(clarifyScene.composerState.kind).toBe("prompt");
		expect(questionOneNextScene.showQuestionOneNextCursor).toBe(true);
		expect(answerSelectScene.showAnswerSelectCursor).toBe(true);
		expect(approveScene.showApproveCursor).toBe(true);
		expect(approveScene.composerState.kind).toBe("draft_ready");
		expect(finalScene.faqDraft).toEqual(PRECISION_FLOW_FAQ_DRAFT);
		expect(finalScene.faqDraft.answer).toContain("recoverable for 30 days");
		expect(finalScene.activeStepId).toBe("faq_draft_ready");
	});

	it("maps each grouped step to the start phase used for manual step jumps", () => {
		expect(getPrecisionFlowStartPhaseForStep("visitor_asks")).toBe(
			"visitor_question"
		);
		expect(getPrecisionFlowStartPhaseForStep("ai_detects_gap")).toBe(
			"gap_search_loading"
		);
		expect(getPrecisionFlowStartPhaseForStep("human_teaches_ai")).toBe(
			"clarify_prompt"
		);
		expect(getPrecisionFlowStartPhaseForStep("faq_draft_ready")).toBe(
			"draft_ready"
		);
	});

	it("returns only the remaining autoplay phases after a resumed step", () => {
		const remainingSequence =
			getPrecisionFlowRemainingSequence("clarify_prompt");

		expect(remainingSequence[0]?.phase).toBe("clarify_click");
		expect(remainingSequence[0]?.delayMs).toBeGreaterThan(0);
		expect(
			remainingSequence.some((entry) => entry.phase === "gap_search_loading")
		).toBe(false);
	});

	it("places the clarify transition between the public handoff and stable prompt state", () => {
		const remainingSequence =
			getPrecisionFlowRemainingSequence("human_handoff");

		expect(remainingSequence[0]?.phase).toBe("clarify_transition");
		expect(remainingSequence[1]?.phase).toBe("clarify_prompt");
	});
});
