import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocsComponentPreviewTabs } from "./component-preview-tabs";

describe("DocsComponentPreviewTabs", () => {
	it("renders a square docs frame without a divider under the tabs", () => {
		const html = renderToStaticMarkup(
			<DocsComponentPreviewTabs
				component={<div>Preview</div>}
				source={<div>Code</div>}
			/>
		);

		expect(html).toContain("mt-6 w-full min-w-0");
		expect(html).toContain('data-slot="docs-component-preview-frame"');
		expect(html).toContain(
			"overflow-auto overscroll-contain bg-background px-4 py-6 md:max-h-[640px] dark:bg-background-100"
		);
		expect(html).toContain("px-4 pt-4 pb-3");
		expect(html).not.toContain("rounded-[24px]");
		expect(html).not.toContain("border-b border-dashed");
	});
});
