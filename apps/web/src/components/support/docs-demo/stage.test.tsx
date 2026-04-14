import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SupportDemoStage } from "./stage";

function renderStage(variant: "bubble" | "panel" | "floating" | "responsive") {
	return renderToStaticMarkup(
		<SupportDemoStage variant={variant}>
			<div>Preview</div>
		</SupportDemoStage>
	);
}

describe("SupportDemoStage", () => {
	it("keeps bubble demos compact", () => {
		const html = renderStage("bubble");

		expect(html).toContain('data-support-demo-variant="bubble"');
		expect(html).toContain("min-h-[220px] md:min-h-[260px]");
		expect(html).toContain("w-full");
	});

	it("bounds panel demos inside a smaller docs shell", () => {
		const html = renderStage("panel");

		expect(html).toContain('data-support-demo-variant="panel"');
		expect(html).toContain("min-h-[420px] md:min-h-[480px]");
		expect(html).toContain("h-[420px] w-full max-w-[400px] md:h-[480px]");
	});

	it("bounds floating demos inside a smaller docs shell", () => {
		const html = renderStage("floating");

		expect(html).toContain('data-support-demo-variant="floating"');
		expect(html).toContain("min-h-[460px] md:min-h-[520px]");
		expect(html).toContain("h-[460px] w-full max-w-[420px] md:h-[520px]");
	});

	it("matches responsive demos to the floating shell bounds", () => {
		const html = renderStage("responsive");

		expect(html).toContain('data-support-demo-variant="responsive"');
		expect(html).toContain("min-h-[460px] md:min-h-[520px]");
		expect(html).toContain("h-[460px] w-full max-w-[420px] md:h-[520px]");
	});
});
