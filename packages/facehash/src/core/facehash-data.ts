import { stringHash } from "../utils/hash";

// ============================================================================
// Types
// ============================================================================

export type Variant = "gradient" | "solid";

export type FaceType = "round" | "cross" | "line" | "curved";

export type FacehashBlinkTiming = {
	delay: number;
	duration: number;
};

export type FacehashBlinkTimings = {
	left: FacehashBlinkTiming;
	right: FacehashBlinkTiming;
};

export const FACE_TYPES: readonly FaceType[] = [
	"round",
	"cross",
	"line",
	"curved",
] as const;

export type FacehashData = {
	/** The face type to render */
	faceType: FaceType;
	/** Index into the colors array */
	colorIndex: number;
	/** Rotation position for 3D effect (-1, 0, or 1 for each axis) */
	rotation: { x: number; y: number };
	/** First letter of the name, uppercase */
	initial: string;
	/** Deterministic blink timing used by the interactive component */
	blinkTimings: FacehashBlinkTimings;
};

export type ComputeFacehashOptions = {
	/** String to generate face from */
	name: string;
	/** Number of colors available (for modulo) */
	colorsLength?: number;
};

// ============================================================================
// Constants
// ============================================================================

const SPHERE_POSITIONS = [
	{ x: -1, y: 1 }, // down-right
	{ x: 1, y: 1 }, // up-right
	{ x: 1, y: 0 }, // up
	{ x: 0, y: 1 }, // right
	{ x: -1, y: 0 }, // down
	{ x: 0, y: 0 }, // center
	{ x: 0, y: -1 }, // left
	{ x: -1, y: -1 }, // down-left
	{ x: 1, y: -1 }, // up-left
] as const;

/**
 * Default color palette using Tailwind CSS color values.
 */
export const DEFAULT_COLORS = [
	"#ec4899", // pink-500
	"#f59e0b", // amber-500
	"#3b82f6", // blue-500
	"#f97316", // orange-500
	"#10b981", // emerald-500
] as const;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Computes deterministic face properties from a name string.
 * Pure function with no side effects or React dependencies.
 */
export function computeFacehash(options: ComputeFacehashOptions): FacehashData {
	const { name, colorsLength = DEFAULT_COLORS.length } = options;

	const hash = stringHash(name);
	const faceIndex = hash % FACE_TYPES.length;
	const colorIndex = hash % colorsLength;
	const positionIndex = hash % SPHERE_POSITIONS.length;
	const position = SPHERE_POSITIONS[positionIndex] ?? { x: 0, y: 0 };
	const blinkSeed = hash * 31;
	const blinkTiming = {
		delay: (blinkSeed % 40) / 10,
		duration: 2 + (blinkSeed % 40) / 10,
	};

	return {
		faceType: FACE_TYPES[faceIndex] ?? "round",
		colorIndex,
		rotation: position,
		initial: name.charAt(0).toUpperCase(),
		blinkTimings: {
			left: { ...blinkTiming },
			right: { ...blinkTiming },
		},
	};
}

const FALLBACK_COLOR = "#ec4899"; // pink-500

/**
 * Gets a color from an array by index, with fallback to default colors.
 */
export function getColor(
	colors: readonly string[] | undefined,
	index: number
): string {
	const palette = colors && colors.length > 0 ? colors : DEFAULT_COLORS;
	return palette[index % palette.length] ?? FALLBACK_COLOR;
}
