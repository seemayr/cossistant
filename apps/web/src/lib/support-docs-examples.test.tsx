import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import {
	ComponentPreview as DocsComponentPreview,
	resolveDocsPreviewName,
} from "@/app/(lander-docs)/components/docs/component-preview";
import { ComponentPreviewTabs } from "@/components/component-preview-tabs";
import SupportBubbleAndHomeDemo from "@/components/support/demo-bubble-and-home";
import SupportClassicBubbleDemo from "@/components/support/demo-classic-bubble";
import SupportCustomHomeDemo from "@/components/support/demo-custom-home";
import SupportDocDemo from "@/components/support/demo-doc";
import SupportFullCompositionDemo from "@/components/support/demo-full-composition";
import SupportPillBubbleDemo from "@/components/support/demo-pill-bubble";
import SupportResponsiveEmbedDemo from "@/components/support/demo-responsive-embed";
import { Index } from "@/registry/__index__";

const docsRoot = path.resolve(
	import.meta.dir,
	"../../content/docs/support-component"
);
const packageReadmePath = path.resolve(
	import.meta.dir,
	"../../../../packages/react/README.md"
);
const docsMdxComponentsPath = path.resolve(
	import.meta.dir,
	"../app/(lander-docs)/components/docs/mdx-components.tsx"
);

async function renderWithSuspense(element: React.ReactNode) {
	const stream = await renderToReadableStream(
		<React.Suspense fallback={<div>Loading...</div>}>{element}</React.Suspense>
	);
	await stream.allReady;
	return await new Response(stream).text();
}

describe("support docs examples", () => {
	it("keeps every primary support demo registered and renderable", () => {
		const demos = [
			["support-doc", SupportDocDemo],
			["support-classic-bubble", SupportClassicBubbleDemo],
			["support-pill-bubble", SupportPillBubbleDemo],
			["support-custom-home", SupportCustomHomeDemo],
			["support-bubble-and-home", SupportBubbleAndHomeDemo],
			["support-full-composition", SupportFullCompositionDemo],
			["support-responsive-embed", SupportResponsiveEmbedDemo],
		] as const;

		for (const [name, Component] of demos) {
			expect(Index[name]).toBeDefined();
			expect(Index[name]?.path).toContain("src/components/support/");
			expect(Index[name]?.sourcePath).toContain(
				"src/components/support/examples/"
			);

			const html = renderToStaticMarkup(React.createElement(Component));
			expect(html.length).toBeGreaterThan(0);
		}
	});

	it("shows React-first source examples while runtime demos keep docs-only harness code", () => {
		const demoNames = [
			"support-doc",
			"support-classic-bubble",
			"support-pill-bubble",
			"support-custom-home",
			"support-bubble-and-home",
			"support-full-composition",
			"support-responsive-embed",
		] as const;

		for (const name of demoNames) {
			const item = Index[name];
			expect(item).toBeDefined();
			if (!item?.sourcePath) {
				throw new Error(`Missing docs example registration for ${name}`);
			}
			const runtimeCode = readFileSync(
				path.resolve(process.cwd(), item.path),
				"utf8"
			);
			const sourceCode = readFileSync(
				path.resolve(process.cwd(), item.sourcePath),
				"utf8"
			);

			expect(runtimeCode).toContain("SupportDocsProvider");
			expect(runtimeCode).toContain("SupportDemoStage");
			expect(sourceCode).toContain("@cossistant/react");
			expect(sourceCode).not.toContain("SupportDocsProvider");
		}
	});

	it("keeps the support docs React-first and preview-backed", () => {
		const indexDoc = readFileSync(path.join(docsRoot, "index.mdx"), "utf8");
		const customizationDoc = readFileSync(
			path.join(docsRoot, "customization.mdx"),
			"utf8"
		);
		const routingDoc = readFileSync(path.join(docsRoot, "routing.mdx"), "utf8");

		expect(indexDoc).not.toContain("@cossistant/next");
		expect(customizationDoc).not.toContain("@cossistant/next");
		expect(routingDoc).not.toContain("@cossistant/next");

		expect(indexDoc).toContain('name="support-doc"');
		expect(indexDoc).toContain('name="support-classic-bubble"');
		expect(indexDoc).toContain('name="support-bubble-and-home"');
		expect(indexDoc).not.toContain("sizeClasses=");
		expect(customizationDoc).toContain('name="support-classic-bubble"');
		expect(customizationDoc).not.toContain("sizeClasses=");
		expect(routingDoc).toContain('name="support-full-composition"');
		expect(routingDoc).not.toContain("sizeClasses=");
	});

	it("renders docs previews through the docs-only wrapper and support alias", async () => {
		const mdxComponentsSource = readFileSync(docsMdxComponentsPath, "utf8");
		const html = await renderWithSuspense(
			<DocsComponentPreview name="support" />
		);

		expect(resolveDocsPreviewName("support")).toBe("support-doc");
		expect(resolveDocsPreviewName("support-classic-bubble")).toBe(
			"support-classic-bubble"
		);
		expect(mdxComponentsSource).toContain(
			'import { ComponentPreview } from "./component-preview";'
		);
		expect(mdxComponentsSource).not.toContain(
			'import { ComponentPreview } from "@/components/component-preview";'
		);
		expect(html).toContain('data-slot="docs-component-preview"');
		expect(html).toContain("min-h-[280px] md:min-h-[360px]");
		expect(html).not.toContain("min-h-[350px] md:min-h-[450px]");
		expect(html).toContain('data-support-demo-variant="panel"');
		expect(html).not.toContain('data-fake-widget-container="true"');
	});

	it("keeps the package README aligned with the new slots and composition API", () => {
		const readme = readFileSync(packageReadmePath, "utf8");

		expect(readme).toContain("slots");
		expect(readme).toContain("Support.Root");
		expect(readme).toContain("data-slot");
		expect(readme).not.toContain("@cossistant/next");
	});

	it("renders the shared preview shell with a dashed border and centered stage", () => {
		const html = renderToStaticMarkup(
			<ComponentPreviewTabs
				component={<div>Preview</div>}
				source={<div>Code</div>}
			/>
		);

		expect(html).toContain("border-dashed");
		expect(html).toContain("items-center");
		expect(html).toContain("justify-center");
	});
});
