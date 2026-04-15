import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocsComponentPreviewTabs } from "./component-preview-tabs";

describe("DocsComponentPreviewTabs", () => {
	it("renders tabs above a square docs frame without a tab divider", () => {
		const html = renderToStaticMarkup(
			<DocsComponentPreviewTabs
				component={<div>Preview</div>}
				source={<div>Code</div>}
			/>
		);

		expect(html).toContain("mt-6 w-full min-w-0");
		expect(html).toContain('data-slot="docs-component-preview-tabs"');
		expect(html).toContain('data-slot="docs-component-preview-frame"');
		expect(html).toContain(
			"overflow-auto overscroll-contain bg-background px-4 py-6 md:max-h-[640px] dark:bg-background-100"
		);
		expect(
			html.indexOf('data-slot="docs-component-preview-tabs"')
		).toBeLessThan(html.indexOf('data-slot="docs-component-preview-frame"'));
		expect(html).not.toContain("px-4 pt-4 pb-3");
		expect(html).not.toContain("rounded");
		expect(html).not.toContain("border-b border-dashed");
	});
});
