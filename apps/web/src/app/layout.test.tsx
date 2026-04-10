import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/font/google", () => ({
	Geist: () => ({ variable: "font-geist-sans" }),
	Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

mock.module("next/font/local", () => ({
	default: () => ({ variable: "font-f37-stout" }),
}));

mock.module("next/script", () => ({
	default: ({
		src,
		...props
	}: React.ScriptHTMLAttributes<HTMLScriptElement>) => (
		<script data-script-src={src} {...props} />
	),
}));

mock.module("@/components/ui/sonner", () => ({
	Toaster: () => <div data-slot="mock-toaster" />,
}));

mock.module("@/lib/metadata", () => ({
	createRootMetadata: () => ({}),
}));

mock.module("./providers", () => ({
	Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const originalDatafastEnabled = process.env.NEXT_PUBLIC_DATAFAST_ENABLED;

describe("RootLayout", () => {
	beforeEach(() => {
		process.env.NEXT_PUBLIC_DATAFAST_ENABLED = undefined;
	});

	afterEach(() => {
		if (originalDatafastEnabled === undefined) {
			process.env.NEXT_PUBLIC_DATAFAST_ENABLED = undefined;
			return;
		}

		process.env.NEXT_PUBLIC_DATAFAST_ENABLED = originalDatafastEnabled;
	});

	afterAll(() => {
		mock.restore();
	});

	it("renders the DataFast script when enabled", async () => {
		process.env.NEXT_PUBLIC_DATAFAST_ENABLED = "true";
		const { default: RootLayout } = await import(`./layout?${Math.random()}`);
		const html = renderToStaticMarkup(
			<RootLayout>
				<div>hello</div>
			</RootLayout>
		);

		expect(html).toContain('data-script-src="https://datafa.st/js/script.js"');
		expect(html).toContain('data-domain="cossistant.com"');
	});

	it("omits the DataFast script when disabled", async () => {
		process.env.NEXT_PUBLIC_DATAFAST_ENABLED = "false";
		const { default: RootLayout } = await import(`./layout?${Math.random()}`);
		const html = renderToStaticMarkup(
			<RootLayout>
				<div>hello</div>
			</RootLayout>
		);

		expect(html).not.toContain(
			'data-script-src="https://datafa.st/js/script.js"'
		);
	});
});
