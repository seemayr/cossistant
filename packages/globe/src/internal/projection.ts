const { PI, atan2, sin, cos } = Math;

const GLOBE_RADIUS = 0.8;

export type ProjectGlobePointInput = {
	latitude: number;
	longitude: number;
	width: number;
	height: number;
	phi: number;
	theta: number;
	scale: number;
	offset: [number, number];
	visibilityThreshold?: number;
};

export type ProjectedGlobePoint = {
	x: number;
	y: number;
	depth: number;
	visible: boolean;
};

const FOCUS_TARGET_LATITUDE_DEGREES = 18;
const MIN_FOCUS_THETA = -0.45;
const MAX_FOCUS_THETA = 0.55;

export function projectGlobePoint({
	latitude,
	longitude,
	width,
	height,
	phi,
	theta,
	scale,
	offset,
	visibilityThreshold = 0.02,
}: ProjectGlobePointInput): ProjectedGlobePoint {
	const mapPoint = latLngToCartesian(latitude, longitude);
	const screenPoint = rotatePointToScreen(mapPoint, phi, theta);
	const depth = clamp(screenPoint[2], 0, 1);
	const visible = screenPoint[2] > visibilityThreshold;
	const aspectRatio = width / height;
	const normalizedX = GLOBE_RADIUS * screenPoint[0];
	const normalizedY = GLOBE_RADIUS * screenPoint[1];
	const x =
		(width * (1 + scale * (normalizedX / aspectRatio + offset[0] / width))) / 2;
	const y = (height * (1 - scale * (normalizedY - offset[1] / height))) / 2;

	return { x, y, depth, visible };
}

export function resolveGlobeFocusOrientation(params: {
	latitude: number;
	longitude: number;
}) {
	const targetLatitude = (FOCUS_TARGET_LATITUDE_DEGREES * PI) / 180;
	const latitude = (params.latitude * PI) / 180;
	const theta = clamp(
		targetLatitude - latitude,
		MIN_FOCUS_THETA,
		MAX_FOCUS_THETA
	);
	const point = latLngToCartesian(params.latitude, params.longitude);
	const tiltedPoint = rotateAroundX(point, -theta);
	const phi = normalizeAngle(atan2(-tiltedPoint[0], tiltedPoint[2]));

	return {
		phi,
		theta,
	};
}

export function latLngToCartesian(latitude: number, longitude: number) {
	const lat = (latitude * PI) / 180;
	const lng = (longitude * PI) / 180 - PI;
	const cosLat = cos(lat);
	return [-cosLat * cos(lng), sin(lat), cosLat * sin(lng)] as const;
}

export function rotatePointToScreen(
	point: readonly [number, number, number],
	phi: number,
	theta: number
) {
	const rotatedX = rotateAroundX(point, -theta);
	// The WebGL globe rotates positive phi to the viewer's right, so the DOM
	// overlay must use the same sign convention to avoid mirrored motion.
	return rotateAroundY(rotatedX, phi);
}

function rotateAroundX(
	[x, y, z]: readonly [number, number, number],
	angle: number
) {
	const cosAngle = cos(angle);
	const sinAngle = sin(angle);
	return [x, y * cosAngle - z * sinAngle, y * sinAngle + z * cosAngle] as const;
}

function rotateAroundY(
	[x, y, z]: readonly [number, number, number],
	angle: number
) {
	const cosAngle = cos(angle);
	const sinAngle = sin(angle);
	return [
		x * cosAngle + z * sinAngle,
		y,
		-x * sinAngle + z * cosAngle,
	] as const;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle: number) {
	if (!Number.isFinite(angle)) {
		return 0;
	}

	const fullTurn = PI * 2;
	return ((((angle + PI) % fullTurn) + fullTurn) % fullTurn) - PI;
}
