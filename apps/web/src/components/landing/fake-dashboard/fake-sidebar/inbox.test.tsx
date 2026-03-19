import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FakeInboxNavigationSidebar } from "./inbox";

describe("FakeInboxNavigationSidebar", () => {
	it("collapses the sidebar shell when open is false", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeInboxNavigationSidebar
					activeView="inbox"
					open={false}
					statusCounts={{ open: 10, resolved: 0, spam: 0, archived: 0 }}
				/>
			</React.StrictMode>
		);

		expect(html).toContain("<aside");
		expect(html).toContain("width:0");
		expect(html).not.toContain(">Inbox<");
	});

	it("renders navigation items when open is true", () => {
		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeInboxNavigationSidebar
					activeView="inbox"
					open={true}
					statusCounts={{ open: 10, resolved: 0, spam: 0, archived: 0 }}
				/>
			</React.StrictMode>
		);

		expect(html).toContain(">Inbox<");
		expect(html).toContain(">Resolved<");
		expect(html).toContain(">Docs<");
	});
});
