import { describe, expect, it } from "bun:test";
import {
	getCobeMarkers,
	getFocusView,
	getPhiFromLongitudeDegrees,
	getShortestAngleDeltaDegrees,
	getThetaFromTiltDegrees,
	normalizeGlobeVisitors,
	resolveGlobeThemeConfig,
} from "./model";

function projectLocation(params: { latitude: number; longitude: number }) {
	const focusView = getFocusView(params);
	const phi = getPhiFromLongitudeDegrees(focusView.longitude);
	const theta = getThetaFromTiltDegrees(focusView.tilt);
	const latitudeRadians = (params.latitude * Math.PI) / 180;
	const longitudeRadians = (params.longitude * Math.PI) / 180 - Math.PI;
	const cosLatitude = Math.cos(latitudeRadians);
	const point: [number, number, number] = [
		-cosLatitude * Math.cos(longitudeRadians),
		Math.sin(latitudeRadians),
		cosLatitude * Math.sin(longitudeRadians),
	];
	const cosTheta = Math.cos(theta);
	const sinTheta = Math.sin(theta);
	const cosPhi = Math.cos(phi);
	const sinPhi = Math.sin(phi);
	const x = cosPhi * point[0] + sinPhi * point[2];
	const y =
		sinPhi * sinTheta * point[0] +
		cosTheta * point[1] -
		cosPhi * sinTheta * point[2];
	const z =
		-sinPhi * cosTheta * point[0] +
		sinTheta * point[1] +
		cosPhi * cosTheta * point[2];

	return {
		visible: z >= 0,
		x: (x + 1) / 2,
		y: (-y + 1) / 2,
	};
}

describe("globe model helpers", () => {
	it("normalizes visitors and filters invalid coordinates", () => {
		const visitors = normalizeGlobeVisitors({
			visitors: [
				{
					id: "alpha user",
					latitude: 48.8566,
					locationLabel: "Paris, France",
					longitude: 2.3522,
					name: "Alice",
					pageLabel: "/pricing",
				},
				{
					id: "alpha user",
					latitude: 40.7128,
					longitude: -74.006,
					name: "Alice Again",
				},
				{
					id: "broken",
					latitude: Number.NaN,
					longitude: 0,
					name: "Broken",
				},
			],
		});

		expect(visitors).toHaveLength(2);
		expect(visitors[0]?.id).toBe("alpha user");
		expect(visitors[1]?.id).toBe("alpha user");
		expect(visitors[0]?.facehashSeed).toBe("Alice");
		expect(visitors[0]?.locationLabel).toBe("Paris, France");
		expect(visitors[0]?.pageLabel).toBe("/pricing");
	});

	it("converts focus coordinates into the expected view angles", () => {
		expect(getFocusView({ latitude: 37.7749, longitude: -122.4194 })).toEqual({
			longitude: -122.4194,
			tilt: 37.7749,
		});
	});

	it("maps focused locations onto the front face of the globe", () => {
		const bangkokProjection = projectLocation({
			latitude: 13.7101,
			longitude: 100.4543,
		});
		const datelineProjection = projectLocation({
			latitude: 0,
			longitude: 179,
		});

		expect(bangkokProjection.visible).toBe(true);
		expect(bangkokProjection.x).toBeCloseTo(0.5, 6);
		expect(bangkokProjection.y).toBeCloseTo(0.5, 6);
		expect(datelineProjection.visible).toBe(true);
		expect(datelineProjection.x).toBeCloseTo(0.5, 6);
		expect(datelineProjection.y).toBeCloseTo(0.5, 6);
	});

	it("computes shortest rotation deltas across the dateline", () => {
		expect(getShortestAngleDeltaDegrees(170, -170)).toBe(20);
		expect(getShortestAngleDeltaDegrees(-170, 170)).toBe(-20);
	});

	it("maps semantic view props into Cobe phi/theta radians", () => {
		expect(getPhiFromLongitudeDegrees(0)).toBeCloseTo(-Math.PI / 2, 6);
		expect(getThetaFromTiltDegrees(12)).toBeCloseTo(0.209_439_51, 6);
	});

	it("resolves theme presets and preserves explicit overrides", () => {
		const config = resolveGlobeThemeConfig("dark", {
			mapSamples: 20_000,
			opacity: 0.9,
		});
		const markers = getCobeMarkers(
			normalizeGlobeVisitors({
				visitors: [
					{
						id: "visitor-1",
						latitude: 1,
						longitude: 2,
						name: "Visitor 1",
					},
				],
			}),
			config.markerColor
		);

		expect(config.dark).toBe(1);
		expect(config.mapSamples).toBe(20_000);
		expect(config.opacity).toBe(0.9);
		expect(markers[0]?.color).toEqual(config.markerColor);
		expect(markers[0]?.id).toBe("visitor-1");
		expect(markers[0]?.size).toBeGreaterThan(0);
	});
});
