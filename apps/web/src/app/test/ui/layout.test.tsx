import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
	usePathname: () => "/test/ui",
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

mock.module("@/components/theme-toggle", () => ({
	ThemeToggle: () => <div data-theme-toggle="true">Theme Toggle</div>,
}));

describe("TestUiLayout", () => {
	it("renders the shared page theme toggle in the header", async () => {
		const layoutModule = await import("./layout");
		const html = renderToStaticMarkup(
			<layoutModule.default>
				<div>Sandbox child</div>
			</layoutModule.default>
		);

		expect(html).toContain("Page Theme");
		expect(html).toContain('data-test-ui-page-theme-toggle="true"');
		expect(html).toContain('data-theme-toggle="true"');
		expect(html).toContain("Sandbox child");
	});
});
