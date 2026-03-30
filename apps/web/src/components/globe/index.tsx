"use client";

import createGlobe, { type Globe as CobeGlobe } from "cobe";
import { useTheme } from "next-themes";
import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
	minHeight?: number | string | null;
	renderScale?: number;
	renderOffset?: {
		x?: number | string;
		y?: number | string;
	} | null;
};

type DragState = {
	isDragging: boolean;
	lastPointerX: number;
	lastPointerY: number;
	lastInteractionAt: number | null;
	pointerId: number | null;
};

const FOCUS_EASING_MS = 220;
const FOCUS_RETURN_IDLE_MS = 900;

function getDevicePixelRatio(): number {
	if (typeof window === "undefined") {
		return 1;
	}

	return Math.min(window.devicePixelRatio || 1, 2);
}

function supportsCssAnchorPositioning(): boolean {
	if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
		return false;
	}

	try {
		return (
			CSS.supports("anchor-name", "--cobe-test") &&
			CSS.supports("position-anchor", "--cobe-test") &&
			CSS.supports("bottom", "anchor(top)") &&
			CSS.supports("left", "anchor(center)")
		);
	} catch {
		return false;
	}
}

function viewsAreEqual(a: GlobeView, b: GlobeView): boolean {
	return (
		Math.abs(getShortestAngleDeltaDegrees(a.longitude, b.longitude)) < 0.05 &&
		Math.abs(a.tilt - b.tilt) < 0.05
	);
}

function resolveRenderOffsetValue(
	value: number | string | undefined,
	size: number
): number {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}

	if (typeof value !== "string") {
		return 0;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return 0;
	}

	if (trimmed.endsWith("%")) {
		const percent = Number.parseFloat(trimmed.slice(0, -1));
		return Number.isFinite(percent) ? (size * percent) / 100 : 0;
	}

	const numeric = trimmed.endsWith("px")
		? Number.parseFloat(trimmed.slice(0, -2))
		: Number.parseFloat(trimmed);

	return Number.isFinite(numeric) ? numeric : 0;
}

function installTextureLoadObserver(params: {
	onTextureLoad: () => void;
}): { restore: () => boolean } | null {
	if (typeof window === "undefined" || typeof window.Image !== "function") {
		return null;
	}

	const NativeImage = window.Image;
	let observedTextureImage = false;
	const handleTextureLoad = () => {
		if (typeof requestAnimationFrame !== "function") {
			params.onTextureLoad();
			return;
		}

		// Let COBE's own `onload` handler upload the texture first, then redraw on
		// the next painted frame so the first revealed frame is already textured.
		requestAnimationFrame(() => {
			requestAnimationFrame(params.onTextureLoad);
		});
	};

	const ObservedImage = ((width?: number, height?: number) => {
		const image = new NativeImage(width, height);
		observedTextureImage = true;
		image.addEventListener("load", handleTextureLoad, {
			once: true,
		});
		return image;
	}) as unknown as typeof window.Image;

	ObservedImage.prototype = NativeImage.prototype;
	Object.setPrototypeOf(ObservedImage, NativeImage);

	Object.defineProperty(window, "Image", {
		configurable: true,
		value: ObservedImage,
		writable: true,
	});

	if (globalThis !== window) {
		Object.defineProperty(globalThis, "Image", {
			configurable: true,
			value: ObservedImage,
			writable: true,
		});
	}

	return {
		restore() {
			Object.defineProperty(window, "Image", {
				configurable: true,
				value: NativeImage,
				writable: true,
			});

			if (globalThis !== window) {
				Object.defineProperty(globalThis, "Image", {
					configurable: true,
					value: NativeImage,
					writable: true,
				});
			}

			return observedTextureImage;
		},
	};
}

function isVisitorPinTarget(target: EventTarget | null): boolean {
	let currentTarget = target;

	while (currentTarget instanceof HTMLElement) {
		if (currentTarget.getAttribute("data-slot") === "globe-visitor-pin") {
			return true;
		}

		currentTarget = currentTarget.parentElement;
	}

	return false;
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
	minHeight = 220,
	renderScale,
	renderOffset = null,
}: GlobeProps) {
	const { resolvedTheme } = useTheme();
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const globeRef = useRef<CobeGlobe | null>(null);
	const isDisposedRef = useRef(false);
	const dragStateRef = useRef<DragState>({
		isDragging: false,
		lastPointerX: 0,
		lastPointerY: 0,
		lastInteractionAt: null,
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
	const readyFrameRef = useRef<number | null>(null);
	const hasRevealedRef = useRef(false);
	const [isDragging, setIsDragging] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
	const [supportsAnchoredOverlay, setSupportsAnchoredOverlay] = useState(false);
	const resolvedThemeMode = theme === "auto" ? resolvedTheme : theme;
	const themeMode = resolvedThemeMode === "dark" ? "dark" : "light";
	const visualConfig = useMemo(
		() => resolveGlobeThemeConfig(themeMode, config),
		[config, themeMode]
	);
	const resolvedVisitors = useMemo(
		() =>
			normalizeGlobeVisitors({
				visitors,
			}),
		[visitors]
	);
	const focusView = useMemo(
		() => (focus ? getFocusView(focus) : null),
		[focus]
	);
	const markers = useMemo(
		() => getCobeMarkers(resolvedVisitors, visualConfig.markerColor),
		[resolvedVisitors, visualConfig.markerColor]
	);
	const latestCreateOptionsRef = useRef({
		focus,
		longitude,
		markers,
		renderOffset,
		renderScale,
		tilt,
		visualConfig,
	});

	latestCreateOptionsRef.current = {
		focus,
		longitude,
		markers,
		renderOffset,
		renderScale,
		tilt,
		visualConfig,
	};

	function getResolvedRenderConfig(params: {
		height: number;
		width: number;
	}): Pick<GlobeConfigOverride, "offset" | "scale"> {
		const baseOffset = latestCreateOptionsRef.current.visualConfig.offset;
		const offsetX =
			(baseOffset?.[0] ?? 0) +
			resolveRenderOffsetValue(
				latestCreateOptionsRef.current.renderOffset?.x,
				params.width
			);
		const offsetY =
			(baseOffset?.[1] ?? 0) +
			resolveRenderOffsetValue(
				latestCreateOptionsRef.current.renderOffset?.y,
				params.height
			);

		return {
			offset:
				baseOffset ||
				latestCreateOptionsRef.current.renderOffset?.x != null ||
				latestCreateOptionsRef.current.renderOffset?.y != null
					? [offsetX, offsetY]
					: undefined,
			scale:
				typeof latestCreateOptionsRef.current.renderScale === "number" &&
				Number.isFinite(latestCreateOptionsRef.current.renderScale)
					? latestCreateOptionsRef.current.renderScale
					: latestCreateOptionsRef.current.visualConfig.scale,
		};
	}

	function getGlobeFrameOptions(params: { height: number; width: number }) {
		return {
			...latestCreateOptionsRef.current.visualConfig,
			...getResolvedRenderConfig(params),
			devicePixelRatio: getDevicePixelRatio(),
			height: params.height,
			markers: latestCreateOptionsRef.current.markers,
			phi: getPhiFromLongitudeDegrees(viewRef.current.longitude),
			theta: getThetaFromTiltDegrees(viewRef.current.tilt),
			width: params.width,
		};
	}

	function scheduleReadyReveal() {
		if (isDisposedRef.current || hasRevealedRef.current) {
			return;
		}

		hasRevealedRef.current = true;

		if (readyFrameRef.current != null) {
			cancelAnimationFrame(readyFrameRef.current);
		}

		const reveal = () => {
			if (isDisposedRef.current) {
				readyFrameRef.current = null;
				return;
			}

			readyFrameRef.current = null;
			setIsReady(true);
		};

		if (typeof requestAnimationFrame !== "function") {
			reveal();
			return;
		}

		readyFrameRef.current = requestAnimationFrame(() => {
			readyFrameRef.current = requestAnimationFrame(reveal);
		});
	}

	function redrawGlobe() {
		const globe = globeRef.current;
		const { height, width } = sizeRef.current;

		if (!globe || width <= 0 || height <= 0) {
			return;
		}

		globe.update(getGlobeFrameOptions({ height, width }));
	}

	function handleTextureReady() {
		if (isDisposedRef.current) {
			return;
		}

		redrawGlobe();
		scheduleReadyReveal();
	}

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
		setSupportsAnchoredOverlay(supportsCssAnchorPositioning());
	}, []);

	useEffect(() => {
		if (!focusView) {
			return;
		}

		dragStateRef.current.lastInteractionAt = null;
	}, [focusView]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!(canvas && container)) {
			return;
		}
		isDisposedRef.current = false;

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
				hasRevealedRef.current = false;
				setIsReady(false);

				const textureLoadObserver = installTextureLoadObserver({
					onTextureLoad: handleTextureReady,
				});
				let observedTextureLoad = false;
				const globe = (() => {
					try {
						return createGlobe(canvas, getGlobeFrameOptions({ height, width }));
					} finally {
						observedTextureLoad = textureLoadObserver?.restore() ?? false;
					}
				})();

				globeRef.current = globe;
				const host = canvas.parentElement;
				setOverlayHost(host instanceof HTMLElement ? host : null);

				if (!observedTextureLoad) {
					scheduleReadyReveal();
				}

				return;
			}

			if (
				sizeRef.current.width === width &&
				sizeRef.current.height === height
			) {
				return;
			}

			sizeRef.current = { height, width };
			globeRef.current.update(getGlobeFrameOptions({ height, width }));
		};

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(syncSize);
			resizeObserver.observe(container);
		}
		syncSize();

		return () => {
			isDisposedRef.current = true;
			resizeObserver?.disconnect();
			lastFrameRef.current = null;
			if (readyFrameRef.current != null) {
				cancelAnimationFrame(readyFrameRef.current);
				readyFrameRef.current = null;
			}
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

		const { height, width } = sizeRef.current;
		if (width <= 0 || height <= 0) {
			return;
		}

		globe.update(getGlobeFrameOptions({ height, width }));
	}, [markers, renderOffset?.x, renderOffset?.y, renderScale, visualConfig]);

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
				const canReturnToFocus =
					!dragStateRef.current.isDragging &&
					(dragStateRef.current.lastInteractionAt == null ||
						frameTime - dragStateRef.current.lastInteractionAt >=
							FOCUS_RETURN_IDLE_MS);

				if (canReturnToFocus) {
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

	const allowHorizontalDrag = allowDrag && longitude === undefined;
	const allowVerticalDrag = allowHorizontalDrag && tilt === undefined;
	const rootStyle: React.CSSProperties | undefined =
		minHeight == null
			? undefined
			: {
					minHeight:
						typeof minHeight === "number" ? `${minHeight}px` : minHeight,
				};

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (!allowHorizontalDrag) {
			return;
		}

		if (isVisitorPinTarget(event.target)) {
			return;
		}

		event.preventDefault();
		dragStateRef.current = {
			isDragging: true,
			lastPointerX: event.clientX,
			lastPointerY: event.clientY,
			lastInteractionAt: lastFrameRef.current ?? 0,
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
		dragStateRef.current.lastInteractionAt = lastFrameRef.current ?? 0;

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
			lastInteractionAt: lastFrameRef.current ?? 0,
			pointerId: null,
		};
		event.currentTarget.releasePointerCapture(event.pointerId);
		setIsDragging(false);
	}

	return (
		<div
			className={cn(
				"relative isolate size-full touch-none overflow-hidden transition-opacity duration-500 ease-out motion-reduce:transition-none",
				isReady ? "opacity-100" : "opacity-0",
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
			style={rootStyle}
		>
			<canvas
				className="size-full"
				data-slot="globe-canvas"
				ref={canvasRef}
				style={{ width: "100%", height: "100%" }}
			/>
			{supportsAnchoredOverlay && overlayHost
				? createPortal(
						<GlobeVisitorOverlay visitors={resolvedVisitors} />,
						overlayHost
					)
				: null}
		</div>
	);
}
