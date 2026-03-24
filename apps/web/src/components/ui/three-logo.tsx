"use client";

/// <reference types="@react-three/fiber" />
import { AsciiRenderer } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
	getLogoIconSvgMarkup,
	LOGO_ICON_ASPECT_RATIO,
} from "@/components/ui/logo";
import { cn } from "@/lib/utils";

type ThreeLogoProps = {
	className?: string;
};

const ASCII_CHARACTERS =
	"$@B%8&WM#*oahkbdpqwmZ0OQLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";
const MOBILE_ASCII_RESOLUTION = 0.4;
const TABLET_ASCII_RESOLUTION = 0.32;
const DESKTOP_ASCII_RESOLUTION = 0.24;
const LOGO_FILL_COLOR = "white";
const LOGO_PLANE_SCALE = 0.84;
const CANVAS_DPR = 2;
const SVG_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(getLogoIconSvgMarkup(LOGO_FILL_COLOR))}`;

function getAsciiResolution(width: number) {
	if (width < 480) {
		return MOBILE_ASCII_RESOLUTION;
	}

	if (width < 768) {
		return TABLET_ASCII_RESOLUTION;
	}

	return DESKTOP_ASCII_RESOLUTION;
}

function LogoPlane() {
	const texture = useLoader(THREE.TextureLoader, SVG_DATA_URL);
	const { viewport } = useThree();

	texture.colorSpace = THREE.SRGBColorSpace;

	const planeWidth =
		viewport.width > 0
			? viewport.width * LOGO_PLANE_SCALE
			: LOGO_ICON_ASPECT_RATIO;
	const planeHeight =
		viewport.height > 0 ? viewport.height * LOGO_PLANE_SCALE : 1;

	return (
		<mesh>
			<planeGeometry args={[planeWidth, planeHeight]} />
			<meshBasicMaterial map={texture} toneMapped={false} transparent />
		</mesh>
	);
}

function InvalidateAsciiFrame({ deps }: { deps: Array<number | string> }) {
	const { invalidate } = useThree();

	useEffect(() => {
		const frameId = requestAnimationFrame(() => {
			invalidate(2);
		});

		return () => cancelAnimationFrame(frameId);
	}, [invalidate, ...deps]);

	return null;
}

export function ThreeLogo({ className }: ThreeLogoProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const [isAsciiMounted, setIsAsciiMounted] = useState(false);
	const { resolvedTheme } = useTheme();

	useLayoutEffect(() => {
		const element = containerRef.current;
		if (!element) {
			return;
		}

		let frameId: number | null = null;

		const updateDimensions = () => {
			const width = Math.max(0, Math.floor(element.clientWidth));
			const height =
				width > 0 ? Math.max(1, Math.floor(width / LOGO_ICON_ASPECT_RATIO)) : 0;

			setDimensions((current) => {
				if (current.width === width && current.height === height) {
					return current;
				}

				return { width, height };
			});
		};

		const scheduleUpdate = () => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}

			frameId = requestAnimationFrame(() => {
				updateDimensions();
				frameId = null;
			});
		};

		updateDimensions();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", scheduleUpdate);
			return () => {
				if (frameId !== null) {
					cancelAnimationFrame(frameId);
				}
				window.removeEventListener("resize", scheduleUpdate);
			};
		}

		const observer = new ResizeObserver(scheduleUpdate);
		observer.observe(element);

		return () => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		if (isAsciiMounted || dimensions.width < 1 || dimensions.height < 1) {
			return;
		}

		const frameId = requestAnimationFrame(() => {
			setIsAsciiMounted(true);
		});

		return () => cancelAnimationFrame(frameId);
	}, [dimensions.height, dimensions.width, isAsciiMounted]);

	const asciiResolution = getAsciiResolution(dimensions.width);
	const foregroundColor = resolvedTheme === "dark" ? "white" : "black";
	const canRenderCanvas = dimensions.width > 0 && dimensions.height > 0;
	const shouldRenderAscii = canRenderCanvas && isAsciiMounted;

	return (
		<div
			className={cn("relative w-full overflow-hidden", className)}
			ref={containerRef}
			style={{ aspectRatio: `${LOGO_ICON_ASPECT_RATIO}` }}
		>
			{canRenderCanvas ? (
				<Canvas
					camera={{ position: [0, 0, 10], fov: 75 }}
					dpr={CANVAS_DPR}
					frameloop="demand"
					gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
					style={{
						height: `${dimensions.height}px`,
						opacity: 0,
						width: `${dimensions.width}px`,
					}}
				>
					<LogoPlane />
					{shouldRenderAscii ? (
						<>
							<AsciiRenderer
								bgColor="transparent"
								characters={ASCII_CHARACTERS}
								fgColor={foregroundColor}
								resolution={asciiResolution}
							/>
							<InvalidateAsciiFrame
								deps={[
									asciiResolution,
									dimensions.height,
									dimensions.width,
									foregroundColor,
								]}
							/>
						</>
					) : null}
				</Canvas>
			) : null}
		</div>
	);
}
