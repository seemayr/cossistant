"use client";

import { useEffect, useState } from "react";

export type ToolDisplayState = "partial" | "result" | "error";
type PendingToolDisplayState = Exclude<ToolDisplayState, "partial">;

export const DEFAULT_TOOL_MINIMUM_LOADING_MS = 1000;

export type ToolDisplayStateSnapshot = {
	toolCallId: string;
	displayedState: ToolDisplayState;
	hasObservedPartial: boolean;
	observedPartialAt: number | null;
	pendingState: PendingToolDisplayState | null;
	readyAt: number | null;
};

export type UseToolDisplayStateParams = {
	toolCallId: string;
	state: ToolDisplayState;
	minimumLoadingMs?: number;
};

function isTerminalState(
	state: ToolDisplayState
): state is PendingToolDisplayState {
	return state !== "partial";
}

export function createToolDisplayStateSnapshot(params: {
	toolCallId: string;
	state: ToolDisplayState;
	now: number;
}): ToolDisplayStateSnapshot {
	const { toolCallId, state, now } = params;

	if (state === "partial") {
		return {
			toolCallId,
			displayedState: "partial",
			hasObservedPartial: true,
			observedPartialAt: now,
			pendingState: null,
			readyAt: null,
		};
	}

	return {
		toolCallId,
		displayedState: state,
		hasObservedPartial: false,
		observedPartialAt: null,
		pendingState: null,
		readyAt: null,
	};
}

export function advanceToolDisplayStateSnapshot(
	snapshot: ToolDisplayStateSnapshot,
	params: {
		toolCallId: string;
		state: ToolDisplayState;
		minimumLoadingMs: number;
		now: number;
	}
): ToolDisplayStateSnapshot {
	const { toolCallId, state, minimumLoadingMs, now } = params;

	if (snapshot.toolCallId !== toolCallId) {
		return createToolDisplayStateSnapshot({ now, state, toolCallId });
	}

	if (state === "partial") {
		return {
			...snapshot,
			displayedState: "partial",
			hasObservedPartial: true,
			observedPartialAt: snapshot.observedPartialAt ?? now,
			pendingState: null,
			readyAt: null,
		};
	}

	if (!snapshot.hasObservedPartial || snapshot.observedPartialAt === null) {
		return {
			...snapshot,
			displayedState: state,
			pendingState: null,
			readyAt: null,
		};
	}

	const readyAt = snapshot.observedPartialAt + Math.max(minimumLoadingMs, 0);

	if (now >= readyAt) {
		return {
			...snapshot,
			displayedState: state,
			pendingState: null,
			readyAt: null,
		};
	}

	return {
		...snapshot,
		displayedState: "partial",
		pendingState: isTerminalState(state) ? state : null,
		readyAt,
	};
}

export function settleToolDisplayStateSnapshot(
	snapshot: ToolDisplayStateSnapshot,
	now: number
): ToolDisplayStateSnapshot {
	if (
		snapshot.pendingState === null ||
		snapshot.readyAt === null ||
		now < snapshot.readyAt
	) {
		return snapshot;
	}

	return {
		...snapshot,
		displayedState: snapshot.pendingState,
		pendingState: null,
		readyAt: null,
	};
}

export function useToolDisplayState({
	toolCallId,
	state,
	minimumLoadingMs = DEFAULT_TOOL_MINIMUM_LOADING_MS,
}: UseToolDisplayStateParams): ToolDisplayState {
	const [snapshot, setSnapshot] = useState(() =>
		createToolDisplayStateSnapshot({
			now: Date.now(),
			state,
			toolCallId,
		})
	);

	useEffect(() => {
		setSnapshot((currentSnapshot) =>
			advanceToolDisplayStateSnapshot(currentSnapshot, {
				minimumLoadingMs,
				now: Date.now(),
				state,
				toolCallId,
			})
		);
	}, [minimumLoadingMs, state, toolCallId]);

	useEffect(() => {
		if (snapshot.readyAt === null) {
			return;
		}

		const timeoutId = setTimeout(
			() => {
				setSnapshot((currentSnapshot) =>
					settleToolDisplayStateSnapshot(currentSnapshot, Date.now())
				);
			},
			Math.max(snapshot.readyAt - Date.now(), 0)
		);

		return () => {
			clearTimeout(timeoutId);
		};
	}, [snapshot.readyAt]);

	return snapshot.displayedState;
}
