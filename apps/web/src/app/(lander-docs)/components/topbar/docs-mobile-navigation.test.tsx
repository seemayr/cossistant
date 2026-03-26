import { describe, expect, it, mock } from "bun:test";
import React, { cloneElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

declare global {
	var __landerDocsTestPathname: string | undefined;
}

mock.module("next/navigation", () => ({
	usePathname: () => globalThis.__landerDocsTestPathname ?? "/docs/quickstart",
}));

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

mock.module("@/components/ui/sheet", () => ({
	Sheet: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet">{children}</div>
	),
	SheetClose: ({
		asChild,
		children,
	}: {
		asChild?: boolean;
		children: React.ReactElement;
	}) =>
		asChild ? (
			cloneElement(children as React.ReactElement<Record<string, string>>, {
				"data-slot": "sheet-close",
			})
		) : (
			<button data-slot="sheet-close" type="button">
				{children}
			</button>
		),
	SheetContent: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div className={className} data-slot="sheet-content">
			{children}
		</div>
	),
	SheetDescription: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet-description">{children}</div>
	),
	SheetHeader: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet-header">{children}</div>
	),
	SheetTitle: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet-title">{children}</div>
	),
	SheetTrigger: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="sheet-trigger">{children}</div>
	),
}));

const modulePromise = import("./docs-mobile-navigation");

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

async function renderDocsMobileNavigation() {
	const { DocsMobileNavigation } = await modulePromise;
	return renderToStaticMarkup(
		<React.StrictMode>
			<DocsMobileNavigation tree={tree} />
		</React.StrictMode>
	);
}

describe("DocsMobileNavigation", () => {
	it("renders the docs tree on docs routes and wraps links with sheet close", async () => {
		globalThis.__landerDocsTestPathname = "/docs/quickstart";

		const html = await renderDocsMobileNavigation();

		expect(html).toContain("Documentation");
		expect(html).toContain('data-slot="docs-mobile-navigation"');
		expect(html).toContain('href="/docs/install"');
		expect(html).toContain('data-slot="sheet-close"');
	});

	it("does not render on non-docs routes", async () => {
		globalThis.__landerDocsTestPathname = "/pricing";

		const html = await renderDocsMobileNavigation();

		expect(html).toBe("");
	});
});
