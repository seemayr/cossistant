import { describe, expect, it } from "bun:test";
import {
	calculateMentionPopoverPosition,
	calculateMentionPopoverViewportPosition,
} from "./mention-popover-position";

describe("calculateMentionPopoverPosition", () => {
	it("places the popover below the caret when there is enough room", () => {
		const position = calculateMentionPopoverPosition({
			caretPosition: { top: 40, left: 120, height: 18 },
			anchorWidth: 500,
			anchorHeight: 400,
			popoverWidth: 260,
			popoverHeight: 180,
			offset: 16,
		});

		expect(position.placement).toBe("below");
		expect(position.top).toBe(74);
		expect(position.left).toBe(112);
	});

	it("flips the popover above the caret when there is not enough room below", () => {
		const position = calculateMentionPopoverPosition({
			caretPosition: { top: 330, left: 160, height: 18 },
			anchorWidth: 500,
			anchorHeight: 360,
			popoverWidth: 260,
			popoverHeight: 180,
			offset: 16,
		});

		expect(position.placement).toBe("above");
		expect(position.top).toBe(134);
		expect(position.left).toBe(152);
	});

	it("clamps horizontal position inside the editor viewport", () => {
		const position = calculateMentionPopoverPosition({
			caretPosition: { top: 60, left: 490, height: 18 },
			anchorWidth: 500,
			anchorHeight: 400,
			popoverWidth: 260,
			popoverHeight: 180,
		});

		expect(position.left).toBe(232);
		expect(position.placement).toBe("below");
	});

	it("translates local position using anchor viewport offsets", () => {
		const position = calculateMentionPopoverViewportPosition({
			localPosition: { left: 24, top: 74 },
			anchorRect: { left: 320, top: 180 },
			popoverWidth: 260,
			popoverHeight: 180,
			viewportWidth: 1280,
			viewportHeight: 720,
		});

		expect(position.left).toBe(344);
		expect(position.top).toBe(254);
	});

	it("clamps top inside the viewport bounds", () => {
		const position = calculateMentionPopoverViewportPosition({
			localPosition: { left: 40, top: -60 },
			anchorRect: { left: 120, top: -20 },
			popoverWidth: 260,
			popoverHeight: 180,
			viewportWidth: 1024,
			viewportHeight: 768,
		});

		expect(position.left).toBe(160);
		expect(position.top).toBe(8);
	});

	it("clamps right edge inside the viewport bounds", () => {
		const position = calculateMentionPopoverViewportPosition({
			localPosition: { left: 250, top: 40 },
			anchorRect: { left: 980, top: 140 },
			popoverWidth: 260,
			popoverHeight: 180,
			viewportWidth: 1200,
			viewportHeight: 800,
		});

		expect(position.left).toBe(932);
		expect(position.top).toBe(180);
	});
});
