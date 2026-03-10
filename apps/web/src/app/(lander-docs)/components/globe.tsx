"use client";

import type { GlobeConfig, GlobeMarker } from "@cossistant/globe";
import { CossistantGlobe } from "@cossistant/globe/cossistant";

import { cn } from "@/lib/utils";

const DEFAULT_MARKERS: GlobeMarker[] = [
	{ location: [14.5995, 120.9842], size: 0.03 },
	{ location: [19.076, 72.8777], size: 0.1 },
	{ location: [23.8103, 90.4125], size: 0.05 },
	{ location: [30.0444, 31.2357], size: 0.07 },
	{ location: [39.9042, 116.4074], size: 0.08 },
	{ location: [-23.5505, -46.6333], size: 0.1 },
	{ location: [19.4326, -99.1332], size: 0.1 },
	{ location: [40.7128, -74.006], size: 0.1 },
	{ location: [34.6937, 135.5022], size: 0.05 },
	{ location: [41.0082, 28.9784], size: 0.06 },
];

export const GLOBE_CONFIG: Partial<GlobeConfig> = {
	devicePixelRatio: 2,
	phi: 0,
	theta: 0.3,
	dark: 0,
	diffuse: 0.4,
	mapSamples: 16_000,
	mapBrightness: 1.2,
	baseColor: [1, 1, 1],
	markerColor: [218 / 255, 91 / 255, 68 / 255],
	glowColor: [1, 1, 1],
	markers: DEFAULT_MARKERS,
};

export function Globe({
	className,
	config = GLOBE_CONFIG,
}: {
	className?: string;
	config?: Partial<GlobeConfig>;
}) {
	const markers = config.markers ?? DEFAULT_MARKERS;
	const markerColor = config.markerColor ??
		GLOBE_CONFIG.markerColor ?? [1, 1, 1];

	return (
		<div
			className={cn(
				"absolute inset-0 z-0 mx-auto aspect-[1/1] w-full max-w-[600px]",
				className
			)}
		>
			<CossistantGlobe
				autoRotateSpeed={0.0005}
				canvasClassName={cn("size-full [contain:layout_paint_size]")}
				config={{
					...config,
					markers: [],
				}}
			>
				{markers.map((marker: GlobeMarker, index: number) => {
					const resolvedColor = marker.color ?? markerColor;
					const markerPixels = Math.max(10, Math.round(marker.size * 150));
					return (
						<CossistantGlobe.Pin
							id={`docs-marker-${index}`}
							key={`docs-marker-${index}`}
							latitude={marker.location[0]}
							longitude={marker.location[1]}
						>
							<span
								className="block rounded-full border border-white/50 shadow-[0_0_0_6px_rgba(255,255,255,0.12)]"
								style={{
									width: `${markerPixels}px`,
									height: `${markerPixels}px`,
									background: toCssColor(resolvedColor),
								}}
							/>
						</CossistantGlobe.Pin>
					);
				})}
			</CossistantGlobe>
		</div>
	);
}

function toCssColor([red, green, blue]: [number, number, number]) {
	return `rgb(${Math.round(red * 255)} ${Math.round(green * 255)} ${Math.round(blue * 255)})`;
}
