import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrowserWithBackground } from "./browser-with-background";

describe("BrowserWithBackground", () => {
	it("uses centered mode by default", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<BrowserWithBackground>
					<div>Demo</div>
				</BrowserWithBackground>
			</React.StrictMode>
		);

		expect(html).toContain("fake-browser-wrapper");
	});
});
