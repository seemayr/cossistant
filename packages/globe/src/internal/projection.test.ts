import { describe, expect, it } from "bun:test";
import {
	latLngToCartesian,
	projectGlobePoint,
	resolveGlobeFocusOrientation,
	rotatePointToScreen,
} from "./projection";

describe("globe projection", () => {
	it("projects the front-center longitude to the middle of the globe", () => {
		const projection = projectGlobePoint({
			latitude: 0,
			longitude: -90,
			width: 200,
			height: 200,
			phi: 0,
			theta: 0,
			scale: 1,
			offset: [0, 0],
		});

		expect(projection.visible).toBe(true);
		expect(projection.x).toBeCloseTo(100, 4);
		expect(projection.y).toBeCloseTo(100, 4);
		expect(projection.depth).toBeCloseTo(1, 4);
	});

	it("hides the same point when the globe rotates it to the back", () => {
		const projection = projectGlobePoint({
			latitude: 0,
			longitude: -90,
			width: 200,
			height: 200,
			phi: Math.PI,
			theta: 0,
			scale: 1,
			offset: [0, 0],
		});

		expect(projection.visible).toBe(false);
		expect(projection.depth).toBe(0);
	});

	it("tilts northern points upward when theta is applied", () => {
		const point = latLngToCartesian(45, -90);
		const screenPoint = rotatePointToScreen(point, 0, 0.4);

		expect(screenPoint[1]).toBeGreaterThan(0);
		expect(screenPoint[2]).toBeGreaterThan(0);
	});

	it("moves front-facing pins rightward as phi increases", () => {
		const point = latLngToCartesian(0, -60);
		const initialScreenPoint = rotatePointToScreen(point, 0, 0);
		const rotatedScreenPoint = rotatePointToScreen(point, 0.2, 0);

		expect(rotatedScreenPoint[0]).toBeGreaterThan(initialScreenPoint[0]);
	});

	it("focuses a target longitude to the middle while keeping it above center", () => {
		const focus = resolveGlobeFocusOrientation({
			latitude: 13.7563,
			longitude: 100.5018,
		});
		const projection = projectGlobePoint({
			latitude: 13.7563,
			longitude: 100.5018,
			width: 200,
			height: 200,
			phi: focus.phi,
			theta: focus.theta,
			scale: 1,
			offset: [0, 0],
		});

		expect(projection.visible).toBe(true);
		expect(projection.x).toBeCloseTo(100, 4);
		expect(projection.y).toBeLessThan(100);
		expect(projection.depth).toBeGreaterThan(0.9);
	});

	it("clamps focus tilt for far-southern coordinates", () => {
		const focus = resolveGlobeFocusOrientation({
			latitude: -72,
			longitude: 42,
		});
		const projection = projectGlobePoint({
			latitude: -72,
			longitude: 42,
			width: 200,
			height: 200,
			phi: focus.phi,
			theta: focus.theta,
			scale: 1,
			offset: [0, 0],
		});

		expect(focus.theta).toBeCloseTo(0.55, 4);
		expect(projection.visible).toBe(true);
	});
});
