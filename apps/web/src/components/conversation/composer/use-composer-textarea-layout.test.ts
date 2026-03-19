import { describe, expect, it } from "bun:test";
import { COMPOSER_MIN_EDITOR_HEIGHT_PX } from "./composer-editor-layout";
import { syncTextareaLayout } from "./use-composer-textarea-layout";

function createFakeTextarea(scrollHeight: number) {
	return {
		scrollHeight,
		style: {
			height: "",
			overflowY: "",
		},
	} as unknown as HTMLTextAreaElement;
}

function createFakeOverlay() {
	return {
		style: {
			height: "",
		},
	} as unknown as HTMLDivElement;
}

describe("syncTextareaLayout", () => {
	it("clamps tiny textarea measurements to the shared minimum editor height", () => {
		const textarea = createFakeTextarea(12);
		const overlay = createFakeOverlay();

		syncTextareaLayout(textarea, overlay);

		expect(textarea.style.height).toBe(`${COMPOSER_MIN_EDITOR_HEIGHT_PX}px`);
		expect(textarea.style.overflowY).toBe("hidden");
		expect(overlay.style.height).toBe(`${COMPOSER_MIN_EDITOR_HEIGHT_PX}px`);
	});

	it("preserves larger textarea measurements", () => {
		const textarea = createFakeTextarea(88);
		const overlay = createFakeOverlay();

		syncTextareaLayout(textarea, overlay);

		expect(textarea.style.height).toBe("88px");
		expect(overlay.style.height).toBe("88px");
	});
});
