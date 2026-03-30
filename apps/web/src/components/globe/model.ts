import type { COBEOptions, Marker } from "cobe";

export type GlobePresenceStatus = "online" | "away";
export type GlobeThemeMode = "auto" | "light" | "dark";
export type GlobeFocus = {
	latitude: number;
	longitude: number;
};

export type GlobeVisitor = {
	id: string;
	latitude: number;
	longitude: number;
	name: string;
	avatarUrl?: string | null;
	facehashSeed?: string | null;
	locationLabel?: string | null;
	pageLabel?: string | null;
	status?: GlobePresenceStatus;
};

export type GlobeRgb = [number, number, number];

export type GlobeConfigOverride = Partial<
	Pick<
		COBEOptions,
		| "arcColor"
		| "arcHeight"
		| "arcWidth"
		| "baseColor"
		| "context"
		| "diffuse"
		| "glowColor"
		| "mapBaseBrightness"
		| "mapBrightness"
		| "mapSamples"
		| "markerColor"
		| "markerElevation"
		| "offset"
		| "opacity"
		| "scale"
	>
>;

export type ResolvedGlobeConfig = {
	arcColor?: GlobeRgb;
	arcHeight?: number;
	arcWidth?: number;
	baseColor: GlobeRgb;
	context?: WebGLContextAttributes;
	dark: 0 | 1;
	diffuse: number;
	glowColor: GlobeRgb;
	mapBaseBrightness: number;
	mapBrightness: number;
	mapSamples: number;
	markerColor: GlobeRgb;
	markerElevation: number;
	offset?: [number, number];
	opacity: number;
	scale: number;
};

export type GlobeView = {
	longitude: number;
	tilt: number;
};

export type ResolvedGlobeVisitor = GlobeVisitor & {
	facehashSeed: string;
	locationLabel: string | null;
	pageLabel: string | null;
};

export const DEFAULT_GLOBE_LONGITUDE = 0;
export const DEFAULT_GLOBE_TILT = 12;
export const DEFAULT_GLOBE_ROTATION_SPEED = 10;
export const MAX_GLOBE_TILT = 89;
export const MIN_GLOBE_TILT = -89;
export const GLOBE_MARKER_SIZE = 0.035;

const LIGHT_GLOBE_PRESET: ResolvedGlobeConfig = {
	baseColor: [0.84, 0.87, 0.93],
	dark: 0,
	diffuse: 1.08,
	glowColor: [1, 1, 1],
	mapBaseBrightness: 0.06,
	mapBrightness: 2,
	mapSamples: 20_000,
	markerColor: [0.18, 0.22, 0.29],
	markerElevation: 0.02,
	opacity: 1,
	scale: 1,
};

const DARK_GLOBE_PRESET: ResolvedGlobeConfig = {
	baseColor: [0.72, 0.79, 0.92],
	dark: 1,
	diffuse: 1.15,
	glowColor: [0.07, 0.09, 0.14],
	mapBaseBrightness: 0.0,
	mapBrightness: 2,
	mapSamples: 20_000,
	markerColor: [0.95, 0.97, 1],
	markerElevation: 0.02,
	opacity: 1,
	scale: 1,
};

function getNonEmptyString(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function isFiniteCoordinate(value: number): boolean {
	return Number.isFinite(value);
}

export function normalizeLongitudeDegrees(longitude: number): number {
	const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;
	return normalized === -180 ? 180 : normalized;
}

export function clampTiltDegrees(tilt: number): number {
	return Math.min(MAX_GLOBE_TILT, Math.max(MIN_GLOBE_TILT, tilt));
}

export function degreesToRadians(value: number): number {
	return (value * Math.PI) / 180;
}

export function radiansToDegrees(value: number): number {
	return (value * 180) / Math.PI;
}

export function getShortestAngleDeltaDegrees(from: number, to: number): number {
	return normalizeLongitudeDegrees(to - from);
}

export function getPhiFromLongitudeDegrees(longitude: number): number {
	// COBE's front-facing zero is offset from geographic longitude by 270deg.
	return degreesToRadians(normalizeLongitudeDegrees(270 - longitude));
}

export function getThetaFromTiltDegrees(tilt: number): number {
	return degreesToRadians(clampTiltDegrees(tilt));
}

export function getFocusView(focus: GlobeFocus): GlobeView {
	return {
		longitude: normalizeLongitudeDegrees(focus.longitude),
		tilt: clampTiltDegrees(focus.latitude),
	};
}

export function getInitialView(params: {
	focus?: GlobeFocus | null;
	longitude?: number;
	tilt?: number;
}): GlobeView {
	if (params.focus) {
		return getFocusView(params.focus);
	}

	return {
		longitude: normalizeLongitudeDegrees(
			params.longitude ?? DEFAULT_GLOBE_LONGITUDE
		),
		tilt: clampTiltDegrees(params.tilt ?? DEFAULT_GLOBE_TILT),
	};
}

export function resolveGlobeThemeConfig(
	theme: Exclude<GlobeThemeMode, "auto">,
	override?: GlobeConfigOverride
): ResolvedGlobeConfig {
	const preset = theme === "dark" ? DARK_GLOBE_PRESET : LIGHT_GLOBE_PRESET;

	return {
		...preset,
		...override,
		dark: preset.dark,
	};
}

export function normalizeGlobeVisitors(params: {
	visitors?: readonly GlobeVisitor[] | null;
}): ResolvedGlobeVisitor[] {
	const visitors = params.visitors ?? [];

	return visitors.flatMap((visitor, index) => {
		if (
			!(
				isFiniteCoordinate(visitor.latitude) &&
				isFiniteCoordinate(visitor.longitude)
			)
		) {
			return [];
		}

		const safeName =
			getNonEmptyString(visitor.name) ?? `Visitor ${String(index + 1)}`;

		return [
			{
				...visitor,
				facehashSeed:
					getNonEmptyString(visitor.facehashSeed) ??
					getNonEmptyString(visitor.name) ??
					visitor.id,
				locationLabel: getNonEmptyString(visitor.locationLabel),
				name: safeName,
				pageLabel: getNonEmptyString(visitor.pageLabel),
			},
		];
	});
}

export function getCobeMarkers(
	visitors: readonly ResolvedGlobeVisitor[],
	markerColor: GlobeRgb
): Marker[] {
	return visitors.map((visitor) => ({
		color: markerColor,
		id: visitor.id,
		location: [visitor.latitude, visitor.longitude],
		size: GLOBE_MARKER_SIZE,
	}));
}
