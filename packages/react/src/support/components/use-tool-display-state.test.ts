import { describe, expect, it } from "bun:test";
import {
	advanceToolDisplayStateSnapshot,
	createToolDisplayStateSnapshot,
	DEFAULT_TOOL_MINIMUM_LOADING_MS,
	settleToolDisplayStateSnapshot,
} from "./use-tool-display-state";

describe("useToolDisplayState helpers", () => {
	it("defaults the minimum loading duration to 1000ms", () => {
		expect(DEFAULT_TOOL_MINIMUM_LOADING_MS).toBe(1000);
	});

	it("holds partial until the minimum loading duration has elapsed", () => {
		const initialSnapshot = createToolDisplayStateSnapshot({
			now: 1000,
			state: "partial",
			toolCallId: "tool-1",
		});

		const pendingSnapshot = advanceToolDisplayStateSnapshot(initialSnapshot, {
			minimumLoadingMs: DEFAULT_TOOL_MINIMUM_LOADING_MS,
			now: 1200,
			state: "result",
			toolCallId: "tool-1",
		});

		expect(pendingSnapshot.displayedState).toBe("partial");
		expect(pendingSnapshot.pendingState).toBe("result");
		expect(pendingSnapshot.readyAt).toBe(2000);

		const settledSnapshot = settleToolDisplayStateSnapshot(
			pendingSnapshot,
			2000
		);

		expect(settledSnapshot.displayedState).toBe("result");
		expect(settledSnapshot.pendingState).toBe(null);
		expect(settledSnapshot.readyAt).toBe(null);
	});

	it("passes terminal states through immediately when no partial was observed", () => {
		const initialSnapshot = createToolDisplayStateSnapshot({
			now: 1000,
			state: "result",
			toolCallId: "tool-1",
		});

		const advancedSnapshot = advanceToolDisplayStateSnapshot(initialSnapshot, {
			minimumLoadingMs: DEFAULT_TOOL_MINIMUM_LOADING_MS,
			now: 1050,
			state: "error",
			toolCallId: "tool-1",
		});

		expect(advancedSnapshot.displayedState).toBe("error");
		expect(advancedSnapshot.pendingState).toBe(null);
		expect(advancedSnapshot.readyAt).toBe(null);
	});

	it("resets the observed partial state when the tool call id changes", () => {
		const initialSnapshot = createToolDisplayStateSnapshot({
			now: 1000,
			state: "partial",
			toolCallId: "tool-1",
		});

		const resetSnapshot = advanceToolDisplayStateSnapshot(initialSnapshot, {
			minimumLoadingMs: DEFAULT_TOOL_MINIMUM_LOADING_MS,
			now: 1100,
			state: "result",
			toolCallId: "tool-2",
		});

		expect(resetSnapshot.toolCallId).toBe("tool-2");
		expect(resetSnapshot.displayedState).toBe("result");
		expect(resetSnapshot.hasObservedPartial).toBe(false);
		expect(resetSnapshot.observedPartialAt).toBe(null);
	});
});
