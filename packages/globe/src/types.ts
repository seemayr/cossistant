import type { CSSProperties, ReactNode } from "react";

export type GlobeRgbColor = [number, number, number];

export type GlobeMarker = {
	location: [number, number];
	size: number;
	color?: GlobeRgbColor;
};

export type GlobeFocusTarget = {
	latitude: number;
	longitude: number;
};

export type GlobeConfig = {
	phi: number;
	theta: number;
	mapSamples: number;
	mapBrightness: number;
	mapBaseBrightness: number;
	baseColor: GlobeRgbColor;
	markerColor: GlobeRgbColor;
	glowColor: GlobeRgbColor;
	markers: GlobeMarker[];
	diffuse: number;
	devicePixelRatio: number;
	dark: number;
	opacity: number;
	offset: [number, number];
	scale: number;
	context?: WebGLContextAttributes;
};

export type GlobePinProps = {
	id: string;
	latitude: number;
	longitude: number;
	children: ReactNode;
	clusterable?: boolean;
	data?: unknown;
	weight?: number;
	markerSize?: number;
	markerColor?: GlobeRgbColor;
};

export interface GlobeClusterMember extends GlobePinProps {
	clusterable: boolean;
	weight: number;
	markerSize: number;
}

export type GlobeCluster = {
	id: string;
	latitude: number;
	longitude: number;
	count: number;
	pinCount: number;
	members: GlobeClusterMember[];
};

export type GlobeClusteringOptions = {
	mode?: "auto" | "always";
	strategy?: "geo-grid";
	threshold?: number;
	cellDegrees?: number;
	renderCluster?: (cluster: GlobeCluster) => ReactNode;
};

export type GlobeProps = {
	children?: ReactNode;
	className?: string;
	canvasClassName?: string;
	overlayClassName?: string;
	style?: CSSProperties;
	config?: Partial<GlobeConfig>;
	focusOn?: GlobeFocusTarget;
	clustering?: false | GlobeClusteringOptions;
	autoRotateSpeed?: number;
	dragSensitivity?: number;
};
