import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("./tooltip", () => ({
	TooltipOnHover: ({
		children,
		content,
	}: {
		children: React.ReactNode;
		content?: React.ReactNode;
	}) => (
		<div data-slot="mock-tooltip" data-tooltip-content={String(content ?? "")}>
			{children}
		</div>
	),
}));

const modulePromise = import("./avatar");

describe("Avatar facehash wrapper", () => {
	it("pins the fallback foreground to black", async () => {
		const { Facehash } = await modulePromise;
		const html = renderToStaticMarkup(
			<Facehash className="text-white dark:text-white" name="agent-47" />
		);

		expect(html).toContain("color:#000000");
		expect(html).toContain("display:block;overflow:visible;color:inherit");
	});

	it("uses a fit-content wrapper and supports overriding tooltip content", async () => {
		const { Avatar } = await modulePromise;
		const html = renderToStaticMarkup(
			<Avatar
				fallbackName="Gorgeous Wolf"
				lastOnlineAt="2026-03-10T11:00:00.000Z"
				tooltipContent="Click to get more details"
				url={null}
			/>
		);

		expect(html).toContain('data-slot="avatar-wrapper"');
		expect(html).toContain("inline-flex w-fit");
		expect(html).toContain("Click to get more details");
	});

	it("supports disabling tooltip content entirely", async () => {
		const { Avatar } = await modulePromise;
		const html = renderToStaticMarkup(
			<Avatar
				fallbackName="Gorgeous Wolf"
				lastOnlineAt="2026-03-10T11:00:00.000Z"
				tooltipContent={null}
				url={null}
			/>
		);

		expect(html).toContain('data-slot="mock-tooltip"');
		expect(html).toContain('data-tooltip-content=""');
	});
});
