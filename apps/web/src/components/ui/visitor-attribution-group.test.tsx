import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitorAttributionGroup } from "./visitor-attribution-group";

const attribution = {
	version: 1 as const,
	firstTouch: {
		channel: "referral" as const,
		isDirect: false,
		referrer: {
			url: "https://www.reddit.com/r/nextjs/comments/123",
			domain: "www.reddit.com",
		},
		landing: {
			url: "https://app.example.com/pricing?utm_source=hn&utm_medium=referral&utm_campaign=launch&utm_content=hero&fbclid=fbclid_123",
			path: "/pricing",
			title: "Pricing | Cossistant",
		},
		utm: {
			source: "hn",
			medium: "referral",
			campaign: "launch",
			content: "hero",
			term: null,
		},
		clickIds: {
			gclid: null,
			gbraid: null,
			wbraid: null,
			fbclid: "fbclid_123",
			msclkid: null,
			ttclid: null,
			li_fat_id: null,
			twclid: null,
		},
		capturedAt: "2026-03-01T09:30:00.000Z",
	},
};

describe("VisitorAttributionGroup", () => {
	it("renders a minimal source-only view by default", () => {
		const html = renderToStaticMarkup(
			<VisitorAttributionGroup attribution={attribution} />
		);

		expect(html).toContain('data-slot="visitor-attribution-group"');
		expect(html).toContain(">Source<");
		expect(html).toContain(">Reddit<");
		expect(html).not.toContain(">Channel<");
		expect(html).not.toContain(">Landing page<");
		expect(html).not.toContain(">Campaign<");
		expect(html).not.toContain(">Ad IDs<");
	});

	it("can render the full attribution set when explicitly requested", () => {
		const html = renderToStaticMarkup(
			<VisitorAttributionGroup attribution={attribution} mode="full" />
		);

		expect(html).toContain('data-slot="visitor-attribution-group"');
		expect(html).toContain(">Source<");
		expect(html).toContain(">Reddit<");
		expect(html).toContain(">Channel<");
		expect(html).toContain(">Landing page<");
		expect(html).toContain(">Campaign<");
		expect(html).toContain(">Ad IDs<");
	});

	it("stays hidden when no usable attribution is available", () => {
		const html = renderToStaticMarkup(
			<VisitorAttributionGroup attribution={null} />
		);

		expect(html).toBe("");
	});
});
