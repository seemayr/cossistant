"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";

type UseComposerHeightSyncOptions = {
	containerRef: RefObject<HTMLDivElement | null>;
	onHeightChange?: (height: number) => void;
};

function syncTimelineScroll(heightDelta: number) {
	if (heightDelta <= 0 || typeof document === "undefined") {
		return;
	}

	const timeline = document.getElementById("conversation-timeline");
	if (!timeline) {
		return;
	}

	const timelineScrollTop = timeline.scrollTop;
	const timelineScrollHeight = timeline.scrollHeight;
	const timelineClientHeight = timeline.clientHeight;
	const distanceFromBottom =
		timelineScrollHeight - timelineScrollTop - timelineClientHeight;

	if (distanceFromBottom <= 50) {
		timeline.scrollTo({
			top: timelineScrollTop + heightDelta,
		});
	}
}

export function useComposerHeightSync({
	containerRef,
	onHeightChange,
}: UseComposerHeightSyncOptions) {
	const previousHeightRef = useRef(0);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const reportHeight = () => {
			const currentHeight = container.getBoundingClientRect().height;
			const heightDelta = currentHeight - previousHeightRef.current;

			if (heightDelta !== 0) {
				onHeightChange?.(currentHeight);
				syncTimelineScroll(heightDelta);
				previousHeightRef.current = currentHeight;
			}
		};

		reportHeight();

		if (typeof ResizeObserver === "undefined") {
			return;
		}

		const resizeObserver = new ResizeObserver(() => {
			reportHeight();
		});

		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, [containerRef, onHeightChange]);
}
