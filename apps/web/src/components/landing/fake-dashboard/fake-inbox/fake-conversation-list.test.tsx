import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMarcConversation } from "../data";
import { FakeConversationList } from "./fake-conversation-list";

describe("FakeConversationList", () => {
	it("does not render live typing preview in inbox rows", () => {
		const conversation = createMarcConversation(
			"Can you help me verify this production fix?",
			new Date("2026-01-01T10:00:00.000Z")
		);

		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversationList conversations={[conversation]} />
			</React.StrictMode>
		);

		expect(html).toContain("Can you help me verify this production fix?");
		expect(html).not.toContain("dot-bounce-1");
	});

	it("keeps regular AI message previews in the inbox row", () => {
		const conversation = createMarcConversation(
			"Can you help me verify this production fix?",
			new Date("2026-01-01T10:00:00.000Z")
		);

		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversationList conversations={[conversation]} />
			</React.StrictMode>
		);

		expect(html).toContain("Can you help me verify this production fix?");
	});

	it("does not render inferred presence badges in server markup for the Marc landing row", () => {
		const conversation = createMarcConversation(
			"Can you help me verify this production fix?",
			new Date("2026-01-01T10:00:00.000Z")
		);

		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversationList conversations={[conversation]} />
			</React.StrictMode>
		);

		expect(html).not.toContain('data-slot="avatar-presence"');
	});

	it("adds subtle spacing above the analytics slot", () => {
		const conversation = createMarcConversation(
			"Can you help me verify this production fix?",
			new Date("2026-01-01T10:00:00.000Z")
		);

		const html = renderToStaticMarkup(
			<React.StrictMode>
				<FakeConversationList
					analyticsSlot={<div>analytics-slot</div>}
					conversations={[conversation]}
				/>
			</React.StrictMode>
		);

		expect(html).toContain('data-slot="fake-inbox-analytics-slot"');
		expect(html).toContain("pt-2 pb-8");
		expect(html).toContain("analytics-slot");
	});
});
