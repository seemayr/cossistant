import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProgressToastContent } from "./sonner";

describe("ProgressToastContent", () => {
	it("renders a determinate progress toast card", () => {
		const html = renderToStaticMarkup(
			<ProgressToastContent
				status="3 of 12 items processed"
				title="Training AI agent..."
				value={25}
				valueLabel="25%"
			/>
		);

		expect(html).toContain('data-slot="progress-toast"');
		expect(html).toContain("Training AI agent...");
		expect(html).toContain("3 of 12 items processed");
		expect(html).toContain("25%");
		expect(html).toContain('role="progressbar"');
		expect(html).toContain('aria-valuenow="25"');
	});

	it("renders an indeterminate progress state without a current value", () => {
		const html = renderToStaticMarkup(
			<ProgressToastContent
				indeterminate
				status="Discovering pages"
				title="Crawling docs.example.com..."
			/>
		);

		expect(html).toContain("Discovering pages");
		expect(html).toContain('data-indeterminate="true"');
		expect(html).not.toContain("aria-valuenow=");
	});
});
