import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useViewportVisibility } from "./use-viewport-visibility";

function VisibilityHarness({
	initialVisibility,
}: {
	initialVisibility?: boolean;
}) {
	const [_ref, isVisible] = useViewportVisibility({
		initialVisibility,
	});

	return <div data-visibility={isVisible ? "visible" : "hidden"} />;
}

describe("useViewportVisibility", () => {
	it("starts hidden by default so below-the-fold demos stay idle on mount", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<VisibilityHarness />
			</React.StrictMode>
		);

		expect(html).toContain('data-visibility="hidden"');
	});

	it("supports opting into an initially visible state when needed", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<VisibilityHarness initialVisibility={true} />
			</React.StrictMode>
		);

		expect(html).toContain('data-visibility="visible"');
	});
});
