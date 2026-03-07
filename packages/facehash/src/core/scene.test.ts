import { describe, expect, it } from "bun:test";
import {
	computeFacehash,
	createFacehashScene,
	FACE_TYPES,
	type FaceType,
} from "./index";

function findNameForFaceType(faceType: FaceType): string {
	for (let index = 0; index < 200; index += 1) {
		const candidate = `facehash-${index}`;
		if (computeFacehash({ name: candidate }).faceType === faceType) {
			return candidate;
		}
	}

	throw new Error(`No candidate found for face type: ${faceType}`);
}

describe("computeFacehash", () => {
	it("returns deterministic face data and blink timings", () => {
		const first = computeFacehash({ name: "agent-47", colorsLength: 5 });
		const second = computeFacehash({ name: "agent-47", colorsLength: 5 });

		expect(second).toEqual(first);
		expect(first.blinkTimings.left).toEqual(first.blinkTimings.right);
		expect(first.blinkTimings.left.duration).toBeGreaterThanOrEqual(2);
		expect(first.blinkTimings.left.delay).toBeGreaterThanOrEqual(0);
	});

	it("can produce all public face types", () => {
		const names = FACE_TYPES.map((faceType) => findNameForFaceType(faceType));
		expect(new Set(names).size).toBe(FACE_TYPES.length);
	});
});

describe("createFacehashScene", () => {
	it("returns a neutral projection for front pose", () => {
		const scene = createFacehashScene({
			name: "agent-47",
			pose: "front",
			intensity3d: "dramatic",
		});

		expect(Math.abs(scene.projection.translateX)).toBe(0);
		expect(Math.abs(scene.projection.translateY)).toBe(0);
		expect(scene.projection.scaleX).toBe(1);
		expect(scene.projection.scaleY).toBe(1);
		expect(scene.gradientCenter).toEqual({ x: 50, y: 50 });
	});

	it("disables pseudo-3d when intensity is none", () => {
		const scene = createFacehashScene({
			name: "agent-47",
			intensity3d: "none",
		});

		expect(Math.abs(scene.projection.translateX)).toBe(0);
		expect(Math.abs(scene.projection.translateY)).toBe(0);
		expect(scene.projection.scaleX).toBe(1);
		expect(scene.projection.scaleY).toBe(1);
		expect(Math.abs(scene.projection.skewX)).toBe(0);
		expect(Math.abs(scene.projection.skewY)).toBe(0);
	});
});
