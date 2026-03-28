"use client";

import createGlobe, { type Globe as CobeGlobe } from "cobe";
import { useTheme } from "next-themes";
import type * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type {
	GlobeConfigOverride,
	GlobeFocus,
	GlobeThemeMode,
	GlobeView,
	GlobeVisitor,
} from "./model";
import {
	clampTiltDegrees,
	DEFAULT_GLOBE_ROTATION_SPEED,
	getCobeMarkers,
	getFocusView,
	getInitialView,
	getPhiFromLongitudeDegrees,
	getShortestAngleDeltaDegrees,
	getThetaFromTiltDegrees,
	normalizeGlobeVisitors,
	normalizeLongitudeDegrees,
	resolveGlobeThemeConfig,
} from "./model";
import { GlobeVisitorOverlay } from "./overlay";

export type {
	GlobeConfigOverride,
	GlobeFocus,
	GlobeThemeMode,
	GlobeVisitor,
} from "./model";

export type GlobeProps = {
	className?: string;
	config?: GlobeConfigOverride;
	focus?: GlobeFocus | null;
	visitors?: readonly GlobeVisitor[] | null;
	theme?: GlobeThemeMode;
	longitude?: number;
	tilt?: number;
	autoRotate?: boolean;
	rotationSpeed?: number;
	allowDrag?: boolean;
};

type DragState = {
	isDragging: boolean;
	lastPointerX: number;
	lastPointerY: number;
	pointerId: number | null;
};

const FOCUS_EASING_MS = 220;

function getDevicePixelRatio(): number {
	if (typeof window === "undefined") {
		return 1;
	}

	return Math.min(window.devicePixelRatio || 1, 2);
}

function viewsAreEqual(a: GlobeView, b: GlobeView): boolean {
	return (
		Math.abs(getShortestAngleDeltaDegrees(a.longitude, b.longitude)) < 0.05 &&
		Math.abs(a.tilt - b.tilt) < 0.05
	);
}

export function Globe({
	className,
	config,
	focus = null,
	visitors,
	theme = "auto",
	longitude,
	tilt,
	autoRotate = true,
	rotationSpeed = DEFAULT_GLOBE_ROTATION_SPEED,
	allowDrag = true,
}: GlobeProps) {
	const id = useId();
	const { resolvedTheme } = useTheme();
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const globeRef = useRef<CobeGlobe | null>(null);
	const dragStateRef = useRef<DragState>({
		isDragging: false,
		lastPointerX: 0,
		lastPointerY: 0,
		pointerId: null,
	});
	const viewRef = useRef<GlobeView>(
		getInitialView({
			focus,
			longitude,
			tilt,
		})
	);
	const sizeRef = useRef({ height: 0, width: 0 });
	const lastFrameRef = useRef<number | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

	const globeIdPrefix = useMemo(
		() => id.replace(/[^a-zA-Z0-9_-]/g, "") || "globe",
		[id]
	);
	const resolvedThemeMode = theme === "auto" ? resolvedTheme : theme;
	const themeMode = resolvedThemeMode === "dark" ? "dark" : "light";
	const visualConfig = useMemo(
		() => resolveGlobeThemeConfig(themeMode, config),
		[config, themeMode]
	);
	const resolvedVisitors = useMemo(
		() =>
			normalizeGlobeVisitors({
				idPrefix: globeIdPrefix,
				visitors,
			}),
		[globeIdPrefix, visitors]
	);
	const focusView = useMemo(
		() => (focus ? getFocusView(focus) : null),
		[focus]
	);
	const markers = useMemo(
		() => getCobeMarkers(resolvedVisitors, visualConfig.baseColor),
		[resolvedVisitors, visualConfig.baseColor]
	);
	const latestCreateOptionsRef = useRef({
		focus,
		longitude,
		markers,
		tilt,
		visualConfig,
	});

	latestCreateOptionsRef.current = {
		focus,
		longitude,
		markers,
		tilt,
		visualConfig,
	};

	function updateGlobeView(nextView: GlobeView) {
		viewRef.current = {
			longitude: normalizeLongitudeDegrees(nextView.longitude),
			tilt: clampTiltDegrees(nextView.tilt),
		};

		globeRef.current?.update({
			phi: getPhiFromLongitudeDegrees(viewRef.current.longitude),
			theta: getThetaFromTiltDegrees(viewRef.current.tilt),
		});
	}

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!(canvas && container)) {
			return;
		}

		const syncSize = () => {
			const width = Math.round(container.clientWidth);
			const height = Math.round(container.clientHeight);
			if (width <= 0 || height <= 0) {
				return;
			}

			if (!globeRef.current) {
				viewRef.current = getInitialView({
					focus: latestCreateOptionsRef.current.focus,
					longitude: latestCreateOptionsRef.current.longitude,
					tilt: latestCreateOptionsRef.current.tilt,
				});
				sizeRef.current = { height, width };

				const globe = createGlobe(canvas, {
					...latestCreateOptionsRef.current.visualConfig,
					devicePixelRatio: getDevicePixelRatio(),
					height,
					markers: latestCreateOptionsRef.current.markers,
					phi: getPhiFromLongitudeDegrees(viewRef.current.longitude),
					theta: getThetaFromTiltDegrees(viewRef.current.tilt),
					width,
				});

				globeRef.current = globe;
				const host = canvas.parentElement;
				setOverlayHost(host instanceof HTMLElement ? host : null);
				return;
			}

			if (
				sizeRef.current.width === width &&
				sizeRef.current.height === height
			) {
				return;
			}

			sizeRef.current = { height, width };
			globeRef.current.update({
				devicePixelRatio: getDevicePixelRatio(),
				height,
				width,
			});
		};

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(syncSize);
			resizeObserver.observe(container);
		}
		syncSize();

		return () => {
			resizeObserver?.disconnect();
			lastFrameRef.current = null;
			setOverlayHost(null);
			globeRef.current?.destroy();
			globeRef.current = null;
		};
	}, []);

	useEffect(() => {
		const globe = globeRef.current;
		if (!globe) {
			return;
		}

		globe.update({
			...visualConfig,
			devicePixelRatio: getDevicePixelRatio(),
			height: sizeRef.current.height,
			markers,
			width: sizeRef.current.width,
		});
	}, [markers, visualConfig]);

	useEffect(() => {
		const globe = globeRef.current;
		if (!globe || typeof requestAnimationFrame !== "function") {
			return;
		}

		let animationFrameId = 0;

		const tick = (frameTime: number) => {
			const previousFrameTime = lastFrameRef.current ?? frameTime;
			const deltaMs = Math.max(16, frameTime - previousFrameTime);
			const deltaSeconds = deltaMs / 1000;
			lastFrameRef.current = frameTime;

			const currentView = viewRef.current;
			let nextView = currentView;

			if (focusView) {
				const progress = 1 - Math.exp(-deltaMs / FOCUS_EASING_MS);
				nextView = {
					longitude: normalizeLongitudeDegrees(
						currentView.longitude +
							getShortestAngleDeltaDegrees(
								currentView.longitude,
								focusView.longitude
							) *
								progress
					),
					tilt:
						currentView.tilt + (focusView.tilt - currentView.tilt) * progress,
				};

				if (viewsAreEqual(nextView, focusView)) {
					nextView = focusView;
				}
			} else {
				if (longitude !== undefined) {
					nextView = {
						...nextView,
						longitude: normalizeLongitudeDegrees(longitude),
					};
				} else if (autoRotate && !dragStateRef.current.isDragging) {
					nextView = {
						...nextView,
						longitude: normalizeLongitudeDegrees(
							currentView.longitude + rotationSpeed * deltaSeconds
						),
					};
				}

				if (tilt !== undefined) {
					nextView = {
						...nextView,
						tilt: clampTiltDegrees(tilt),
					};
				}
			}

			if (!viewsAreEqual(currentView, nextView)) {
				updateGlobeView(nextView);
			}

			animationFrameId = requestAnimationFrame(tick);
		};

		animationFrameId = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(animationFrameId);
			lastFrameRef.current = null;
		};
	}, [autoRotate, focusView, longitude, rotationSpeed, tilt]);

	const allowHorizontalDrag =
		allowDrag && longitude === undefined && focusView === null;
	const allowVerticalDrag = allowHorizontalDrag && tilt === undefined;

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (!allowHorizontalDrag) {
			return;
		}

		if (
			event.target instanceof HTMLElement &&
			event.target.closest('[data-slot="globe-visitor-pin"]')
		) {
			return;
		}

		event.preventDefault();
		dragStateRef.current = {
			isDragging: true,
			lastPointerX: event.clientX,
			lastPointerY: event.clientY,
			pointerId: event.pointerId,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		setIsDragging(true);
	}

	function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
		if (!dragStateRef.current.isDragging) {
			return;
		}

		const width = Math.max(sizeRef.current.width, 1);
		const height = Math.max(sizeRef.current.height, 1);
		const deltaX = event.clientX - dragStateRef.current.lastPointerX;
		const deltaY = event.clientY - dragStateRef.current.lastPointerY;

		dragStateRef.current.lastPointerX = event.clientX;
		dragStateRef.current.lastPointerY = event.clientY;

		const nextView: GlobeView = {
			longitude: normalizeLongitudeDegrees(
				viewRef.current.longitude - (deltaX / width) * 180
			),
			tilt: allowVerticalDrag
				? clampTiltDegrees(viewRef.current.tilt + (deltaY / height) * 120)
				: viewRef.current.tilt,
		};

		updateGlobeView(nextView);
	}

	function finishPointerDrag(event: React.PointerEvent<HTMLDivElement>) {
		if (
			!dragStateRef.current.isDragging ||
			dragStateRef.current.pointerId !== event.pointerId
		) {
			return;
		}

		dragStateRef.current = {
			isDragging: false,
			lastPointerX: 0,
			lastPointerY: 0,
			pointerId: null,
		};
		event.currentTarget.releasePointerCapture(event.pointerId);
		setIsDragging(false);
	}

	return (
		<div
			className={cn(
				"relative isolate size-full touch-none overflow-hidden",
				allowHorizontalDrag
					? isDragging
						? "cursor-grabbing"
						: "cursor-grab"
					: undefined,
				className
			)}
			data-slot="globe-root"
			onPointerCancel={finishPointerDrag}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={finishPointerDrag}
			ref={containerRef}
		>
			<canvas
				className="size-full"
				data-slot="globe-canvas"
				ref={canvasRef}
				style={{ width: "100%", height: "100%" }}
			/>
			{overlayHost
				? createPortal(
						<GlobeVisitorOverlay visitors={resolvedVisitors} />,
						overlayHost
					)
				: null}
		</div>
	);
}
