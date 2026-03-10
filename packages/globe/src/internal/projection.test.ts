import { describe, expect, it } from "bun:test";
import {
	latLngToCartesian,
	projectGlobePoint,
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
});
