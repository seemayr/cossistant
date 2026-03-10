import type { GlobeClusteringOptions, GlobeConfig } from "./types";

export const DEFAULT_MARKER_SIZE = 0.06;

export const DEFAULT_AUTO_ROTATE_SPEED = 0.0006;

export const DEFAULT_DRAG_SENSITIVITY = 1400;

export const DEFAULT_GLOBE_CONFIG: GlobeConfig = {
	phi: 0,
	theta: 0.3,
	mapSamples: 16_000,
	mapBrightness: 1.2,
	mapBaseBrightness: 0,
	baseColor: [0.93, 0.94, 0.97],
	markerColor: [0.95, 0.52, 0.28],
	glowColor: [1, 1, 1],
	markers: [],
	diffuse: 0.4,
	devicePixelRatio: 1,
	dark: 0,
	opacity: 1,
	offset: [0, 0],
	scale: 1,
};

export const DEFAULT_GLOBE_CLUSTERING: Required<
	Omit<GlobeClusteringOptions, "renderCluster">
> = {
	mode: "auto",
	strategy: "geo-grid",
	threshold: 120,
	cellDegrees: 5,
};
