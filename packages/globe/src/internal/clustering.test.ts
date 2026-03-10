import { describe, expect, it } from "bun:test";
import { resolveRenderItems } from "./clustering";
import type { NormalizedPin } from "./pins";

function createPin(overrides: Partial<NormalizedPin> = {}): NormalizedPin {
	return {
		id: overrides.id ?? "pin-1",
		latitude: overrides.latitude ?? 37.7749,
		longitude: overrides.longitude ?? -122.4194,
		children: overrides.children ?? "pin",
		clusterable: overrides.clusterable ?? true,
		data: overrides.data,
		weight: overrides.weight ?? 1,
		markerSize: overrides.markerSize ?? 0.06,
		markerColor: overrides.markerColor,
	};
}

describe("resolveRenderItems", () => {
	it("leaves pins unclustered when auto mode threshold is not crossed", () => {
		const items = resolveRenderItems(
			[createPin({ id: "a" }), createPin({ id: "b", latitude: 40.7128 })],
			{
				mode: "auto",
				threshold: 5,
				cellDegrees: 5,
				strategy: "geo-grid",
			}
		);

		expect(items).toHaveLength(2);
		expect(items.every((item) => item.kind === "pin")).toBe(true);
	});

	it("clusters geo buckets and keeps non-clusterable pins separate", () => {
		const items = resolveRenderItems(
			[
				createPin({
					id: "sf-1",
					latitude: 37.78,
					longitude: -122.42,
					weight: 3,
				}),
				createPin({
					id: "sf-2",
					latitude: 37.8,
					longitude: -122.41,
					weight: 2,
				}),
				createPin({
					id: "fixed",
					latitude: 37.79,
					longitude: -122.43,
					clusterable: false,
				}),
			],
			{
				mode: "always",
				threshold: 1,
				cellDegrees: 10,
				strategy: "geo-grid",
			}
		);

		expect(items).toHaveLength(2);
		expect(items[0]?.kind).toBe("pin");
		expect(items[1]?.kind).toBe("cluster");

		if (items[1]?.kind !== "cluster") {
			throw new Error("Expected a cluster render item");
		}

		expect(items[1].cluster.count).toBe(5);
		expect(items[1].cluster.pinCount).toBe(2);
		expect(items[1].cluster.members.map((member) => member.id)).toEqual([
			"sf-1",
			"sf-2",
		]);
	});
});
