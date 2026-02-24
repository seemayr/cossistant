import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebsiteImage } from "./website-image";

describe("WebsiteImage", () => {
	it("renders fallback initial when no logo url is provided", () => {
		const html = renderToStaticMarkup(
			<WebsiteImage logoUrl={null} name="Acme" />
		);

		expect(html).toContain(">A<");
		expect(html).not.toContain("<img");
	});

	it("renders logo image when a logo url is provided", () => {
		const html = renderToStaticMarkup(
			<WebsiteImage
				logoUrl="https://cdn.example.com/acme-logo.svg"
				name="Acme"
			/>
		);

		expect(html).toContain("<img");
		expect(html).toContain('src="https://cdn.example.com/acme-logo.svg"');
		expect(html).toContain('alt="Acme"');
	});
});
