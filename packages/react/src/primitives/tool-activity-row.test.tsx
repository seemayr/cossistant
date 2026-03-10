import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolActivityRow } from "./tool-activity-row";

describe("ToolActivityRow", () => {
	it("renders a spinner for partial state", () => {
		const html = renderToStaticMarkup(
			<ToolActivityRow state="partial" text="Working..." tone="widget" />
		);

		expect(html).toContain('data-tool-display-state="partial"');
		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="spinner"');
		expect(html).toContain('data-co-spinner="true"');
	});

	it("renders the ascii arrow for result state", () => {
		const html = renderToStaticMarkup(
			<ToolActivityRow state="result" text="Finished" tone="dashboard" />
		);

		expect(html).toContain('data-tool-display-state="result"');
		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).toContain("-&gt;");
	});

	it("renders the ascii arrow for error state", () => {
		const html = renderToStaticMarkup(
			<ToolActivityRow state="error" text="Failed" tone="widget" />
		);

		expect(html).toContain('data-tool-display-state="error"');
		expect(html).toContain('data-tool-execution-indicator="arrow"');
		expect(html).toContain('data-state="error"');
	});

	it("keeps the spinner for partial state when terminal indicators are disabled", () => {
		const html = renderToStaticMarkup(
			<ToolActivityRow
				showTerminalIndicator={false}
				state="partial"
				text="Working..."
				tone="widget"
			/>
		);

		expect(html).toContain('data-tool-execution-indicator-slot="true"');
		expect(html).toContain('data-tool-execution-indicator="spinner"');
	});

	it("omits the terminal arrow when disabled for result and error states", () => {
		const resultHtml = renderToStaticMarkup(
			<ToolActivityRow
				showTerminalIndicator={false}
				state="result"
				text="Finished"
				tone="dashboard"
			/>
		);
		const errorHtml = renderToStaticMarkup(
			<ToolActivityRow
				showTerminalIndicator={false}
				state="error"
				text="Failed"
				tone="widget"
			/>
		);

		expect(resultHtml).toContain('data-tool-display-state="result"');
		expect(resultHtml).not.toContain('data-tool-execution-indicator="arrow"');
		expect(resultHtml).not.toContain(
			'data-tool-execution-indicator-slot="true"'
		);
		expect(errorHtml).toContain('data-tool-display-state="error"');
		expect(errorHtml).not.toContain('data-tool-execution-indicator="arrow"');
		expect(errorHtml).not.toContain(
			'data-tool-execution-indicator-slot="true"'
		);
	});
});
