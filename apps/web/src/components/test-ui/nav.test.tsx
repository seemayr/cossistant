import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTestUiNavItems } from "./registry";

mock.module("next/navigation", () => ({
	usePathname: () => "/test/ui/timeline",
	useRouter: () => ({
		push: (_href: string) => {},
		replace: (_href: string) => {},
		prefetch: async (_href: string) => {},
	}),
}));

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

describe("TestUiNav", () => {
	it("renders navigation items from the shared registry", async () => {
		const { TestUiNav } = await import("./nav");
		const html = renderToStaticMarkup(<TestUiNav />);

		for (const item of getTestUiNavItems()) {
			expect(html).toContain(item.href);
			expect(html).toContain(item.label);
		}
	});
});
