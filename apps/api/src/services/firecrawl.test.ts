import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { FirecrawlService } from "./firecrawl";

describe("FirecrawlService.mapSite", () => {
	const originalFetch = globalThis.fetch;
	const originalWarn = console.warn;

	let capturedRequestBody: Record<string, unknown> | null = null;
	let warnSpy = mock(() => {});

	beforeEach(() => {
		capturedRequestBody = null;
		warnSpy = mock(() => {});
		console.warn = warnSpy as typeof console.warn;

		globalThis.fetch = (async (
			_input: string | URL | Request,
			init?: RequestInit
		) => {
			capturedRequestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
				string,
				unknown
			>;

			return new Response(
				JSON.stringify({
					success: true,
					links: ["https://example.com/docs"],
				}),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
					},
				}
			);
		}) as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		console.warn = originalWarn;
	});

	it("drops unsupported map options like maxAge from request body", async () => {
		const firecrawlService = new FirecrawlService("test-key");

		const result = await firecrawlService.mapSite("https://example.com", {
			limit: 100,
			ignoreCache: false,
			maxAge: 3_600_000,
		} as unknown as Parameters<FirecrawlService["mapSite"]>[1]);

		expect(result).toEqual({
			success: true,
			urls: ["https://example.com/docs"],
		});
		expect(capturedRequestBody).toEqual({
			url: "https://example.com",
			includeSubdomains: false,
			limit: 100,
			ignoreCache: false,
		});
		expect(capturedRequestBody?.maxAge).toBeUndefined();
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it("maps sitemapOnly and ignoreCache to supported Firecrawl /map fields", async () => {
		const firecrawlService = new FirecrawlService("test-key");

		await firecrawlService.mapSite("https://example.com", {
			search: "docs",
			includeSubdomains: true,
			limit: 42,
			sitemapOnly: true,
			ignoreSitemap: true,
			ignoreCache: true,
		});

		expect(capturedRequestBody).toEqual({
			url: "https://example.com",
			search: "docs",
			includeSubdomains: true,
			limit: 42,
			sitemap: "only",
			ignoreCache: true,
		});
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("maps ignoreSitemap to sitemap=skip", async () => {
		const firecrawlService = new FirecrawlService("test-key");

		await firecrawlService.mapSite("https://example.com", {
			ignoreSitemap: true,
		});

		expect(capturedRequestBody).toEqual({
			url: "https://example.com",
			includeSubdomains: false,
			limit: 100,
			sitemap: "skip",
		});
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
