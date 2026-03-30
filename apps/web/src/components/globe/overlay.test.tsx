import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({
		facehashSeed,
		fallbackName,
		status,
		url,
	}: {
		facehashSeed?: string;
		fallbackName: string;
		status?: string;
		url?: string | null;
	}) => (
		<div
			data-facehash-seed={facehashSeed}
			data-name={fallbackName}
			data-slot="mock-avatar"
			data-status={status}
			data-url={String(url ?? "")}
		/>
	),
}));

const modulePromise = import("./overlay");

describe("GlobeVisitorOverlay", () => {
	it("renders anchor-positioned visitor pins using the visitor id", async () => {
		const { GlobeVisitorOverlay } = await modulePromise;
		const html = renderToStaticMarkup(
			<GlobeVisitorOverlay
				visitors={[
					{
						avatarUrl: null,
						facehashSeed: "visitor-facehash",
						id: "visitor-1",
						latitude: 48.8566,
						locationLabel: "Paris, France",
						longitude: 2.3522,
						name: "Alice",
						pageLabel: "/pricing",
						status: "online",
					},
				]}
			/>
		);

		expect(html).toContain('data-slot="globe-visitor-pin"');
		expect(html).toContain("position:absolute");
		expect(html).toContain("position-anchor:--cobe-visitor-1");
		expect(html).toContain("bottom:anchor(top)");
		expect(html).toContain("left:anchor(center)");
		expect(html).toContain("opacity:var(--cobe-visible-visitor-1, 0)");
		expect(html).not.toContain("--globe-pin-visibility");
		expect(html).not.toContain('data-slot="globe-visitor-card"');
		expect(html).not.toContain("rounded-full");
		expect(html).toContain('data-facehash-seed="visitor-facehash"');
		expect(html).toContain('data-name="Alice"');
		expect(html).toContain('data-status="online"');
	});
});
