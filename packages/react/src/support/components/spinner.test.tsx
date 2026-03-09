import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Spinner } from "./spinner";

function countOccurrences(html: string, pattern: string): number {
	return html.split(pattern).length - 1;
}

describe("Spinner", () => {
	it("renders a 3x3 grid of cells", () => {
		const html = renderToStaticMarkup(<Spinner />);

		expect(html).toContain('data-co-spinner="true"');
		expect(countOccurrences(html, 'data-co-spinner-cell="true"')).toBe(9);
	});

	it("renders stable auto-variant markup for SSR", () => {
		const firstHtml = renderToStaticMarkup(<Spinner />);
		const secondHtml = renderToStaticMarkup(<Spinner />);

		expect(firstHtml).toBe(secondHtml);
		expect(firstHtml).toMatch(/data-co-spinner-variant="(orbit|wave|pulse)"/);
	});

	it("uses the requested explicit variant", () => {
		const html = renderToStaticMarkup(<Spinner variant="pulse" />);

		expect(html).toContain('data-co-spinner-variant="pulse"');
	});
});
