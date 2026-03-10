import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CossistantGlobe } from "./cossistant";
import { Globe, GlobePin } from "./index";

describe("@cossistant/globe exports", () => {
	it("exposes compound pin components on both entrypoints", () => {
		expect(Globe.Pin).toBe(GlobePin);
		expect(CossistantGlobe.Pin).toBe(GlobePin);
	});

	it("renders clustered overlays from pin children", () => {
		const html = renderToStaticMarkup(
			<Globe
				clustering={{
					mode: "always",
					cellDegrees: 10,
					strategy: "geo-grid",
				}}
			>
				<Globe.Pin id="sf-1" latitude={37.78} longitude={-122.42} weight={3}>
					<span>SF 1</span>
				</Globe.Pin>
				<Globe.Pin id="sf-2" latitude={37.79} longitude={-122.41} weight={2}>
					<span>SF 2</span>
				</Globe.Pin>
			</Globe>
		);

		expect(html).toContain('data-globe-item-kind="cluster"');
		expect(html).toContain(">5<");
	});
});
