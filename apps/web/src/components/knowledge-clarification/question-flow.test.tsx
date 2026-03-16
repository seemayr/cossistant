import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	changeKnowledgeClarificationFreeAnswer,
	getKnowledgeClarificationSubmitPayload,
	isKnowledgeClarificationOtherSelected,
	type KnowledgeClarificationAnswerDraftState,
	KnowledgeClarificationQuestionContent,
	selectKnowledgeClarificationAnswer,
} from "./question-flow";

const EMPTY_ANSWER_DRAFT_STATE: KnowledgeClarificationAnswerDraftState = {
	selectedAnswer: null,
	freeAnswer: "",
};

describe("knowledge clarification answer draft", () => {
	it("treats typed custom content as the fourth selected option", () => {
		const state = changeKnowledgeClarificationFreeAnswer(
			EMPTY_ANSWER_DRAFT_STATE,
			"  I need a custom answer  "
		);

		expect(state).toEqual({
			selectedAnswer: null,
			freeAnswer: "  I need a custom answer  ",
		});
		expect(isKnowledgeClarificationOtherSelected(state.freeAnswer)).toBe(true);
		expect(getKnowledgeClarificationSubmitPayload(state)).toEqual({
			freeAnswer: "I need a custom answer",
		});
	});

	it("does not enable submission for whitespace-only custom input", () => {
		const state = changeKnowledgeClarificationFreeAnswer(
			EMPTY_ANSWER_DRAFT_STATE,
			"   "
		);

		expect(isKnowledgeClarificationOtherSelected(state.freeAnswer)).toBe(false);
		expect(getKnowledgeClarificationSubmitPayload(state)).toBeNull();
	});

	it("clears any custom text when a preset answer is chosen", () => {
		const state = selectKnowledgeClarificationAnswer(
			"At the next billing cycle"
		);

		expect(state).toEqual({
			selectedAnswer: "At the next billing cycle",
			freeAnswer: "",
		});
		expect(getKnowledgeClarificationSubmitPayload(state)).toEqual({
			selectedAnswer: "At the next billing cycle",
		});
	});

	it("clears the preset selection once the user starts typing a custom answer", () => {
		const selectedState = selectKnowledgeClarificationAnswer("Immediately");
		const state = changeKnowledgeClarificationFreeAnswer(
			selectedState,
			"It depends on the plan"
		);

		expect(state.selectedAnswer).toBeNull();
		expect(isKnowledgeClarificationOtherSelected(state.freeAnswer)).toBe(true);
		expect(getKnowledgeClarificationSubmitPayload(state)).toEqual({
			freeAnswer: "It depends on the plan",
		});
	});
});

describe("KnowledgeClarificationQuestionContent", () => {
	it("renders the fourth option as an inline textarea with the new placeholder", () => {
		const html = renderToStaticMarkup(
			<KnowledgeClarificationQuestionContent
				freeAnswer=""
				isOtherSelected={false}
				onFreeAnswerChange={() => {}}
				onSelectAnswer={() => {}}
				question="Does the billing change immediately?"
				selectedAnswer={null}
				suggestedAnswers={[
					"Immediately",
					"At the next billing cycle",
					"It depends on the plan",
				]}
			/>
		);

		expect(html).toContain('placeholder="Type your answer here..."');
		expect(html).not.toContain(">Other<");
	});
});
