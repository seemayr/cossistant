import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarProvider } from "@/components/ui/sidebar";

mock.module("next/link", () => ({
	default: ({
		children,
		href,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
		children: React.ReactNode;
		href: string;
	}) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

const modulePromise = import("./docs-nav-tree");

const tree = {
	children: [
		{
			$id: "getting-started",
			children: [
				{
					name: "Quickstart",
					type: "page" as const,
					url: "/docs/quickstart",
				},
				{
					name: "Install",
					type: "page" as const,
					url: "/docs/install",
				},
			],
			name: "Getting Started",
			type: "folder" as const,
		},
	],
};

async function renderDocsNavTree(pathname: string) {
	const { DocsNavTree } = await modulePromise;

	return renderToStaticMarkup(
		<React.StrictMode>
			<SidebarProvider>
				<DocsNavTree pathname={pathname} tree={tree} />
			</SidebarProvider>
		</React.StrictMode>
	);
}

describe("DocsNavTree", () => {
	it("renders section labels and page links", async () => {
		const html = await renderDocsNavTree("/docs/quickstart");

		expect(html).toContain("Getting Started");
		expect(html).toContain('href="/docs/quickstart"');
		expect(html).toContain('href="/docs/install"');
	});

	it("marks the current docs page as active", async () => {
		const html = await renderDocsNavTree("/docs/install");

		expect(html).toContain('data-docs-url="/docs/install"');
		expect(html).toContain('aria-current="page"');
		expect(html).toContain('data-active="true"');
	});
});
