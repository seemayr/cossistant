"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
	DEFAULT_AUTO_ROTATE_SPEED,
	DEFAULT_DRAG_SENSITIVITY,
	DEFAULT_GLOBE_CLUSTERING,
	DEFAULT_GLOBE_CONFIG,
} from "./defaults";
import { resolveRenderItems } from "./internal/clustering";
import { createCobeRenderer } from "./internal/create-cobe-renderer";
import { extractPins } from "./internal/pins";
import {
	projectGlobePoint,
	resolveGlobeFocusOrientation,
} from "./internal/projection";
import { GlobePin } from "./pin";
import type {
	GlobeCluster,
	GlobeClusteringOptions,
	GlobeConfig,
	GlobeFocusTarget,
	GlobeProps,
} from "./types";

type GlobeCompoundComponent = ((props: GlobeProps) => React.JSX.Element) & {
	Pin: typeof GlobePin;
};

const OVERLAY_ITEM_STYLE: CSSProperties = {
	position: "absolute",
	left: 0,
	top: 0,
	transformOrigin: "center",
	willChange: "transform, opacity",
	pointerEvents: "auto",
};

function GlobeBase({
	children,
	className,
	canvasClassName,
	overlayClassName,
	style,
	config,
	focusOn,
	clustering,
	autoRotateSpeed = DEFAULT_AUTO_ROTATE_SPEED,
	dragSensitivity = DEFAULT_DRAG_SENSITIVITY,
}: GlobeProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const overlayItemRefs = useRef(new Map<string, HTMLDivElement>());
	const sizeRef = useRef({ width: 0, height: 0 });
	const dragStateRef = useRef({ active: false, lastClientX: 0 });
	const initialConfig = resolveConfig(config, focusOn);
	const phiRef = useRef(initialConfig.phi);
	const configRef = useRef(initialConfig);
	const renderItemsRef = useRef(
		resolveRenderItems(extractPins(children), resolveClustering(clustering))
	);
	const autoRotateSpeedRef = useRef(autoRotateSpeed);
	const dragSensitivityRef = useRef(dragSensitivity);
	const pendingConfigSyncRef = useRef(true);
	const [hasMeasuredSize, setHasMeasuredSize] = useState(false);
	const [isReady, setIsReady] = useState(false);

	const resolvedConfig = resolveConfig(config, focusOn);
	const resolvedClustering = resolveClustering(clustering);
	const pins = extractPins(children);
	const renderItems = resolveRenderItems(pins, resolvedClustering);

	configRef.current = resolvedConfig;
	renderItemsRef.current = renderItems;
	autoRotateSpeedRef.current = autoRotateSpeed;
	dragSensitivityRef.current = dragSensitivity;
	pendingConfigSyncRef.current = true;

	useEffect(() => {
		phiRef.current = resolvedConfig.phi;
	}, [resolvedConfig.phi]);

	useEffect(() => {
		syncOverlayLayout();
	});

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!(container && canvas)) {
			return;
		}

		const measure = () => {
			const width = Math.max(1, Math.round(container.clientWidth));
			const height = Math.max(1, Math.round(container.clientHeight));
			sizeRef.current = { width, height };
			const devicePixelRatio = configRef.current.devicePixelRatio;
			canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
			canvas.height = Math.max(1, Math.round(height * devicePixelRatio));
			setHasMeasuredSize(true);
			syncOverlayLayout();
		};

		measure();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", measure);
			return () => {
				window.removeEventListener("resize", measure);
			};
		}

		const observer = new ResizeObserver(measure);
		observer.observe(container);
		return () => {
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		if (!(hasMeasuredSize && canvasRef.current)) {
			return;
		}

		const globe = createCobeRenderer(canvasRef.current, {
			...configRef.current,
			width: Math.max(
				1,
				Math.round(sizeRef.current.width * configRef.current.devicePixelRatio)
			),
			height: Math.max(
				1,
				Math.round(sizeRef.current.height * configRef.current.devicePixelRatio)
			),
			onRender: () => {
				if (!dragStateRef.current.active) {
					phiRef.current += autoRotateSpeedRef.current;
				}

				const currentConfig = configRef.current;
				const nextState: Record<string, unknown> = {
					phi: phiRef.current,
					width: Math.max(
						1,
						Math.round(sizeRef.current.width * currentConfig.devicePixelRatio)
					),
					height: Math.max(
						1,
						Math.round(sizeRef.current.height * currentConfig.devicePixelRatio)
					),
				};

				if (pendingConfigSyncRef.current) {
					Object.assign(nextState, {
						theta: currentConfig.theta,
						mapSamples: currentConfig.mapSamples,
						mapBrightness: currentConfig.mapBrightness,
						mapBaseBrightness: currentConfig.mapBaseBrightness,
						baseColor: currentConfig.baseColor,
						markerColor: currentConfig.markerColor,
						glowColor: currentConfig.glowColor,
						markers: currentConfig.markers,
						diffuse: currentConfig.diffuse,
						dark: currentConfig.dark,
						opacity: currentConfig.opacity,
						offset: currentConfig.offset,
						scale: currentConfig.scale,
					});
					pendingConfigSyncRef.current = false;
				}

				syncOverlayLayout();
				return nextState;
			},
		});

		setIsReady(true);
		if (canvasRef.current) {
			canvasRef.current.style.cursor = "grab";
		}
		syncOverlayLayout();

		return () => {
			setIsReady(false);
			globe.destroy();
		};
	}, [hasMeasuredSize]);

	const renderCluster = resolvedClustering
		? (resolvedClustering.renderCluster ?? defaultRenderCluster)
		: defaultRenderCluster;

	return (
		<div
			className={joinClasses(className)}
			ref={containerRef}
			style={{
				position: "relative",
				width: "100%",
				aspectRatio: "1 / 1",
				overflow: "hidden",
				...style,
			}}
		>
			<canvas
				className={joinClasses(canvasClassName)}
				onPointerCancel={handlePointerRelease}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerRelease}
				ref={canvasRef}
				style={{
					display: "block",
					width: "100%",
					height: "100%",
					opacity: isReady ? 1 : 0,
					transition: "opacity 220ms ease",
					touchAction: "none",
				}}
			/>
			<div
				className={joinClasses(overlayClassName)}
				style={{
					position: "absolute",
					inset: 0,
					pointerEvents: "none",
					overflow: "hidden",
				}}
			>
				{renderItems.map((item) => (
					<div
						data-globe-item-id={item.key}
						data-globe-item-kind={item.kind}
						key={item.key}
						ref={(node) => {
							if (node) {
								overlayItemRefs.current.set(item.key, node);
							} else {
								overlayItemRefs.current.delete(item.key);
							}
						}}
						style={OVERLAY_ITEM_STYLE}
					>
						{item.kind === "pin"
							? item.pin.children
							: renderCluster(item.cluster)}
					</div>
				))}
			</div>
		</div>
	);

	function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
		dragStateRef.current.active = true;
		dragStateRef.current.lastClientX = event.clientX;
		event.currentTarget.setPointerCapture(event.pointerId);
		event.currentTarget.style.cursor = "grabbing";
	}

	function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
		if (!dragStateRef.current.active) {
			return;
		}

		const deltaX = event.clientX - dragStateRef.current.lastClientX;
		dragStateRef.current.lastClientX = event.clientX;
		phiRef.current += deltaX / dragSensitivityRef.current;
		syncOverlayLayout();
	}

	function handlePointerRelease(event: React.PointerEvent<HTMLCanvasElement>) {
		dragStateRef.current.active = false;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		event.currentTarget.style.cursor = "grab";
	}

	function syncOverlayLayout() {
		const { width, height } = sizeRef.current;
		if (!(width && height)) {
			return;
		}

		const currentConfig = configRef.current;

		for (const item of renderItemsRef.current) {
			const node = overlayItemRefs.current.get(item.key);
			if (!node) {
				continue;
			}

			const source =
				item.kind === "pin"
					? item.pin
					: {
							latitude: item.cluster.latitude,
							longitude: item.cluster.longitude,
						};
			const projection = projectGlobePoint({
				latitude: source.latitude,
				longitude: source.longitude,
				width,
				height,
				phi: phiRef.current,
				theta: currentConfig.theta,
				scale: currentConfig.scale,
				offset: currentConfig.offset,
			});

			if (!projection.visible) {
				node.style.opacity = "0";
				node.style.visibility = "hidden";
				node.style.pointerEvents = "none";
				node.style.transform = "translate3d(-9999px, -9999px, 0)";
				continue;
			}

			const depthScale =
				item.kind === "cluster"
					? 0.88 + projection.depth * 0.2
					: 0.76 + projection.depth * 0.32;
			const depthOpacity = Math.max(0.35, projection.depth);
			node.style.visibility = "visible";
			node.style.pointerEvents = "auto";
			node.style.opacity = depthOpacity.toFixed(3);
			node.style.zIndex = `${Math.round(projection.depth * 1000)}`;
			node.style.transform =
				`translate3d(${projection.x.toFixed(2)}px, ${projection.y.toFixed(2)}px, 0) ` +
				`translate(-50%, -50%) scale(${depthScale.toFixed(3)})`;
		}
	}
}

function defaultRenderCluster(cluster: GlobeCluster) {
	return (
		<div
			style={{
				display: "inline-flex",
				minWidth: "2rem",
				height: "2rem",
				alignItems: "center",
				justifyContent: "center",
				padding: "0 0.625rem",
				borderRadius: "999px",
				background: "rgba(15, 23, 42, 0.82)",
				border: "1px solid rgba(255, 255, 255, 0.18)",
				color: "#fff",
				fontSize: "0.75rem",
				fontWeight: 600,
				lineHeight: 1,
				backdropFilter: "blur(10px)",
				boxShadow: "0 10px 30px rgba(15, 23, 42, 0.24)",
				whiteSpace: "nowrap",
			}}
		>
			{cluster.count}
		</div>
	);
}

function resolveConfig(
	config: GlobeProps["config"],
	focusOn: GlobeFocusTarget | undefined
): GlobeConfig {
	const devicePixelRatio =
		typeof config?.devicePixelRatio === "number"
			? config.devicePixelRatio
			: typeof window === "undefined"
				? DEFAULT_GLOBE_CONFIG.devicePixelRatio
				: Math.min(window.devicePixelRatio || 1, 2);
	const focusOrientation = focusOn
		? resolveGlobeFocusOrientation(focusOn)
		: null;

	return {
		...DEFAULT_GLOBE_CONFIG,
		...(focusOrientation ?? {}),
		...config,
		baseColor: config?.baseColor ?? DEFAULT_GLOBE_CONFIG.baseColor,
		markerColor: config?.markerColor ?? DEFAULT_GLOBE_CONFIG.markerColor,
		glowColor: config?.glowColor ?? DEFAULT_GLOBE_CONFIG.glowColor,
		offset: config?.offset ?? DEFAULT_GLOBE_CONFIG.offset,
		markers: config?.markers ?? DEFAULT_GLOBE_CONFIG.markers,
		devicePixelRatio,
	};
}

function resolveClustering(
	clustering: false | GlobeClusteringOptions | undefined
) {
	if (!clustering) {
		return clustering;
	}

	return {
		...DEFAULT_GLOBE_CLUSTERING,
		...clustering,
	};
}

function joinClasses(...values: Array<string | undefined>) {
	return values.filter(Boolean).join(" ");
}

export const Globe = Object.assign(GlobeBase, {
	Pin: GlobePin,
}) as GlobeCompoundComponent;
