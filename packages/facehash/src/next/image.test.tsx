import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createFacehashScene } from "../core";
import { FacehashImage } from "./image";
import { toSatoriProjectionTransform } from "./projection";

describe("FacehashImage", () => {
	it("keeps eyes and initial inside the same projected wrapper with explicit black foreground", () => {
		const size = 256;
		const scene = createFacehashScene({
			name: "agent-47",
			intensity3d: "dramatic",
		});
		const html = renderToStaticMarkup(
			<FacehashImage
				backgroundColor="#ec4899"
				scene={scene}
				showInitial
				size={size}
				variant="gradient"
			/>
		);
		const transform = toSatoriProjectionTransform(scene.projection, size);

		expect(html).toContain('data-facehash-png-projection=""');
		expect(html).toContain(`transform:${transform}`);
		expect(html).toMatch(
			/data-facehash-png-projection=""[\s\S]*data-facehash-png-eyes=""[\s\S]*data-facehash-png-initial=""/
		);
		expect(html).not.toMatch(/data-facehash-png-initial=""[^>]*transform:/);
		expect(html).toContain('fill="#000000"');
		expect(html).toContain("color:#000000");
	});
});
