"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const FAKE_MOUSE_CURSOR_ANIMATION_DURATION_S = 1.05;
export const FAKE_MOUSE_CURSOR_START_OFFSET_X = 12;
export const FAKE_MOUSE_CURSOR_START_Y = 76;
export const FAKE_MOUSE_CURSOR_RETRY_DELAY_MS = 8;

export function getFakeMouseCursorMotionPlan(params: {
	containerRect: Pick<DOMRect, "left" | "top" | "width" | "height">;
	targetRect: Pick<DOMRect, "left" | "top" | "width" | "height">;
	cursorSize?: number;
}) {
	const cursorSize = params.cursorSize ?? 14;

	return {
		startX: params.containerRect.width + FAKE_MOUSE_CURSOR_START_OFFSET_X,
		startY: FAKE_MOUSE_CURSOR_START_Y,
		targetX:
			params.targetRect.left -
			params.containerRect.left +
			params.targetRect.width / 2 -
			cursorSize / 2,
		targetY:
			params.targetRect.top -
			params.containerRect.top +
			params.targetRect.height / 2 -
			cursorSize / 2,
	};
}

type FakeMouseCursorProps = {
	isVisible: boolean;
	targetElementRef: React.RefObject<HTMLElement | null>;
	containerRef?: React.RefObject<HTMLElement | null>;
	onClick: () => void;
	targetMode?: "conversation-row" | "element";
	className?: string;
};

export function FakeMouseCursor({
	isVisible,
	targetElementRef,
	containerRef,
	onClick,
	targetMode = "conversation-row",
	className,
}: FakeMouseCursorProps) {
	const [startPosition, setStartPosition] = useState({ x: 0, y: 0 });
	const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });

	useEffect(() => {
		if (isVisible) {
			return;
		}

		setStartPosition({ x: 0, y: 0 });
		setTargetPosition({ x: 0, y: 0 });
	}, [isVisible]);

	useEffect(() => {
		if (!isVisible) {
			return;
		}

		let timeoutId: NodeJS.Timeout | undefined;
		let retryCount = 0;
		const maxRetries = 10;

		const updatePositions = () => {
			// Clear any existing timeout
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			if (!targetElementRef.current) {
				// Retry if element not found yet
				if (retryCount < maxRetries) {
					retryCount++;
					timeoutId = setTimeout(
						updatePositions,
						FAKE_MOUSE_CURSOR_RETRY_DELAY_MS
					);
				}
				return;
			}

			const actualTarget =
				targetMode === "conversation-row"
					? targetElementRef.current.querySelector(
							".group\\/conversation-item, [class*='conversation-item']"
						) || targetElementRef.current
					: targetElementRef.current;

			const pageContainer =
				containerRef?.current ??
				(actualTarget.closest(".relative") as HTMLElement | null);

			if (!pageContainer) {
				// Retry if container not found
				if (retryCount < maxRetries) {
					retryCount++;
					timeoutId = setTimeout(
						updatePositions,
						FAKE_MOUSE_CURSOR_RETRY_DELAY_MS
					);
				}
				return;
			}

			const containerRect = (
				pageContainer as HTMLElement
			).getBoundingClientRect();
			const targetRect = (actualTarget as HTMLElement).getBoundingClientRect();

			// Only proceed if target element has valid dimensions
			if (targetRect.width === 0 || targetRect.height === 0) {
				if (retryCount < maxRetries) {
					retryCount++;
					timeoutId = setTimeout(
						updatePositions,
						FAKE_MOUSE_CURSOR_RETRY_DELAY_MS
					);
				}
				return;
			}

			const { startX, startY, targetX, targetY } = getFakeMouseCursorMotionPlan(
				{
					containerRect,
					targetRect,
				}
			);

			setStartPosition({ x: startX, y: startY });
			setTargetPosition({ x: targetX, y: targetY });
		};

		updatePositions();

		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [isVisible, targetElementRef, targetMode, containerRef]);

	// Don't render until positions are calculated (prevents flash of cursor in wrong position)
	if (!isVisible) {
		return null;
	}

	// Wait for positions to be calculated before rendering
	if (startPosition.x === 0 && targetPosition.x === 0) {
		return null;
	}

	return (
		<motion.div
			animate={{
				x: targetPosition.x - startPosition.x,
				y: targetPosition.y - startPosition.y,
				scale: [1, 0.9, 1],
			}}
			className={cn(
				"pointer-events-none absolute z-50 size-3.5 rounded-full bg-primary shadow-[0_10px_24px_rgba(15,23,42,0.24),0_0_18px_rgba(255,122,0,0.26)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.62),0_0_18px_rgba(255,122,0,0.34)]",
				className
			)}
			data-fake-mouse-cursor="true"
			data-fake-mouse-cursor-style="dot"
			initial={{ scale: 1, opacity: 1 }}
			onAnimationComplete={() => {
				// Trigger click after animation completes
				onClick();
			}}
			style={{
				left: startPosition.x,
				top: startPosition.y,
				willChange: "transform",
			}}
			transition={{
				duration: 0.88,
				ease: [0.25, 0.1, 0.25, 1],
				scale: {
					times: [0, 0.85, 1],
					duration: 0.88,
				},
			}}
		/>
	);
}
