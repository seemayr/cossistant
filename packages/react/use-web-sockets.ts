import { useMemo, useRef, useSyncExternalStore } from "react";
import type { ClientStatus, WebSocketClient } from "../core/client";
import type { InEvent } from "../core/events";

export type WebSocketSnapshot = {
	readonly status: ClientStatus;
	readonly lastEvent: InEvent | null;
};

export type UseWebSocketsOptions<T> = {
	readonly selector?: (snapshot: WebSocketSnapshot) => T;
	readonly equality?: (left: T, right: T) => boolean;
};

type ExternalStore = {
	subscribe(listener: () => void): () => void;
	getSnapshot(): WebSocketSnapshot;
};

function createStore(client: WebSocketClient): ExternalStore {
	let snapshot: WebSocketSnapshot = {
		status: client.status(),
		lastEvent: null,
	};
	const listeners = new Set<() => void>();
	let unsubscribeAll: (() => void) | null = null;
	let unsubscribeStatus: (() => void) | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const notify = () => {
		for (const listener of listeners) {
			listener();
		}
	};

	const ensureSubscriptions = () => {
		if (listeners.size > 0 && !unsubscribeAll) {
			unsubscribeAll = client.subscribeAll((event) => {
				snapshot = { ...snapshot, lastEvent: event };
				notify();
			});
			if (typeof client.subscribeStatus === "function") {
				unsubscribeStatus = client.subscribeStatus((status) => {
					snapshot = { ...snapshot, status };
					notify();
				});
			} else {
				pollTimer = setInterval(() => {
					const nextStatus = client.status();
					if (
						nextStatus.state !== snapshot.status.state ||
						nextStatus.attempts !== snapshot.status.attempts ||
						nextStatus.queueSize !== snapshot.status.queueSize ||
						nextStatus.dropped !== snapshot.status.dropped
					) {
						snapshot = { ...snapshot, status: nextStatus };
						notify();
					}
				}, 500);
			}
		}
	};

	const teardown = () => {
		if (listeners.size === 0) {
			if (unsubscribeAll) {
				unsubscribeAll();
				unsubscribeAll = null;
			}
			if (unsubscribeStatus) {
				unsubscribeStatus();
				unsubscribeStatus = null;
			}
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
		}
	};

	return {
		subscribe(listener: () => void): () => void {
			listeners.add(listener);
			ensureSubscriptions();
			return () => {
				listeners.delete(listener);
				teardown();
			};
		},
		getSnapshot(): WebSocketSnapshot {
			return snapshot;
		},
	};
}

const defaultSelector = (snapshot: WebSocketSnapshot): WebSocketSnapshot =>
	snapshot;
const defaultEquality = <T>(left: T, right: T): boolean =>
	Object.is(left, right);

export function useWebSockets<T = WebSocketSnapshot>(
	client: WebSocketClient,
	options: UseWebSocketsOptions<T> = {}
): T {
	const store = useMemo(() => createStore(client), [client]);
	const optionSelector = options.selector ?? (defaultSelector as unknown);
	const selectSnapshot = optionSelector as (snapshot: WebSocketSnapshot) => T;
	const equality = options.equality ?? defaultEquality<T>;
	const currentSnapshot = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot
	);
	const selection = selectSnapshot(currentSnapshot);
	const lastSelection = useRef(selection);
	const stableSelection = lastSelection.current;
	if (!equality(selection, stableSelection)) {
		lastSelection.current = selection;
	}
	return lastSelection.current;
}
