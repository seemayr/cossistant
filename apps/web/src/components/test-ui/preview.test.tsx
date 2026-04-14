import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	TestUiPreviewFrame,
	TestUiPreviewSurface,
	TestUiPreviewUnsupported,
} from "./preview";

describe("test-ui preview primitives", () => {
	it("renders themed preview frames with pass-through attributes", () => {
		const html = renderToStaticMarkup(
			<TestUiPreviewFrame data-preview-slot="primary" theme="dark">
				<div>Preview body</div>
			</TestUiPreviewFrame>
		);

		expect(html).toContain('data-test-ui-preview-theme="dark"');
		expect(html).toContain('data-color-scheme="dark"');
		expect(html).toContain('data-preview-slot="primary"');
		expect(html).toContain("Preview body");
	});

	it("renders unsupported fallback content through the shared preview surface", () => {
		const html = renderToStaticMarkup(
			<TestUiPreviewSurface
				cardProps={{ "data-preview-surface": "widget" }}
				description="Support timeline preview"
				fallback={
					<TestUiPreviewUnsupported
						data-preview-unsupported="true"
						description="Developer-only logs stay hidden in the widget."
						title="Not supported"
					/>
				}
				frameProps={{ "data-preview-frame": "widget" }}
				theme="light"
				title="Widget Preview"
			>
				<div>Should not render</div>
			</TestUiPreviewSurface>
		);

		expect(html).toContain('data-preview-surface="widget"');
		expect(html).toContain('data-preview-unsupported="true"');
		expect(html).toContain("Not supported");
		expect(html).toContain("Developer-only logs stay hidden in the widget.");
		expect(html).not.toContain("Should not render");
	});
});
