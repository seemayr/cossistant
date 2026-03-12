import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Progress } from "./progress";

describe("Progress", () => {
	it("renders a segmented progress meter", () => {
		const html = renderToStaticMarkup(<Progress value={25} />);

		expect(html).toContain('data-slot="progress"');
		expect(html).toContain('data-slot="progress-track"');
		expect(html).toContain('data-slot="progress-fill"');
		expect(html).toContain('role="progressbar"');
		expect(html).toContain('aria-valuenow="25"');
		expect(html).toContain("width:max(25%, var(--progress-min-fill))");
	});

	it("keeps zero-value progress empty", () => {
		const html = renderToStaticMarkup(<Progress value={0} />);

		expect(html).toContain("width:0%");
	});

	it("preserves custom indicator color classes", () => {
		const html = renderToStaticMarkup(
			<Progress indicatorClassName="text-warning" value={80} />
		);

		expect(html).toContain("text-warning");
	});

	it("supports indeterminate progress semantics", () => {
		const html = renderToStaticMarkup(<Progress indeterminate />);

		expect(html).toContain('data-indeterminate="true"');
		expect(html).not.toContain("aria-valuenow=");
		expect(html).toContain("width:38%");
	});
});
