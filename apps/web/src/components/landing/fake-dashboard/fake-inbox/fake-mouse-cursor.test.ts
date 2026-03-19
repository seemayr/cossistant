import { describe, expect, it } from "bun:test";
import {
	FAKE_MOUSE_CURSOR_ANIMATION_DURATION_S,
	FAKE_MOUSE_CURSOR_RETRY_DELAY_MS,
	FAKE_MOUSE_CURSOR_START_OFFSET_X,
	FAKE_MOUSE_CURSOR_START_Y,
	getFakeMouseCursorMotionPlan,
} from "./fake-mouse-cursor";

describe("FakeMouseCursor", () => {
	it("uses a shorter travel baseline for faster demo cursor movement", () => {
		const motionPlan = getFakeMouseCursorMotionPlan({
			containerRect: {
				left: 10,
				top: 20,
				width: 400,
				height: 240,
			},
			targetRect: {
				left: 210,
				top: 120,
				width: 80,
				height: 32,
			},
		});

		expect(FAKE_MOUSE_CURSOR_START_OFFSET_X).toBe(12);
		expect(FAKE_MOUSE_CURSOR_START_Y).toBe(76);
		expect(FAKE_MOUSE_CURSOR_RETRY_DELAY_MS).toBe(8);
		expect(FAKE_MOUSE_CURSOR_ANIMATION_DURATION_S).toBe(1.05);
		expect(motionPlan.startX).toBe(412);
		expect(motionPlan.startY).toBe(76);
		expect(motionPlan.targetX).toBe(233);
		expect(motionPlan.targetY).toBe(109);
	});
});
