import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TEST_UI_PAGE_DEFINITIONS } from "@/components/test-ui/registry";

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

describe("TestUiIndexPage", () => {
	it("renders sandbox cards from the shared registry", async () => {
		const routeModule = await import("./page");
		const html = renderToStaticMarkup(<routeModule.default />);

		for (const page of TEST_UI_PAGE_DEFINITIONS) {
			expect(html).toContain(page.href);
			expect(html).toContain(page.title);
			expect(html).toContain(page.description);
		}
	});
});
