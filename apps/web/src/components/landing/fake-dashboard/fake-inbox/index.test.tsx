import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createMarcConversation } from "../data";

mock.module("../fake-sidebar/inbox", () => ({
	FakeInboxNavigationSidebar: () => <div data-slot="fake-inbox-sidebar" />,
}));

mock.module("@/components/inbox-analytics", () => ({
	InboxAnalyticsDisplay: ({
		livePresence,
	}: {
		livePresence?: {
			count: number | null;
		};
	}) => (
		<div
			data-live-count={livePresence?.count ?? "none"}
			data-slot="mock-fake-inbox-analytics"
		/>
	),
	InboxAnalyticsRangeControl: () => (
		<div data-slot="mock-fake-inbox-range-control" />
	),
}));

const modulePromise = import("./index");

describe("FakeInbox", () => {
	it("matches the desktop inbox header controls and live analytics demo", async () => {
		const { FakeInbox } = await modulePromise;
		const conversation = createMarcConversation(
			"Can you help me verify this production fix?",
			new Date("2026-01-01T10:00:00.000Z")
		);

		const html = renderToStaticMarkup(
			<FakeInbox conversations={[conversation]} />
		);

		expect(html).toContain('data-slot="fake-inbox-header-controls"');
		expect(html).toContain('data-slot="mock-fake-inbox-range-control"');
		expect(html).toContain('data-slot="fake-inbox-analytics-slot"');
		expect(html).toContain('data-slot="mock-fake-inbox-analytics"');
		expect(html).toContain('data-live-count="12"');
	});
});
