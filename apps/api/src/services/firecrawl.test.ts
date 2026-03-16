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

describe("FirecrawlService.getCrawlStatus", () => {
	const originalFetch = globalThis.fetch;
	const originalWarn = console.warn;

	let fetchCalls: string[] = [];
	let warnSpy = mock(() => {});

	beforeEach(() => {
		fetchCalls = [];
		warnSpy = mock(() => {});
		console.warn = warnSpy as typeof console.warn;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		console.warn = originalWarn;
	});

	it("stops paginated fetching when Firecrawl repeats the next cursor", async () => {
		const firecrawlService = new FirecrawlService("test-key");

		globalThis.fetch = (async (input: string | URL | Request) => {
			const url = String(input);
			fetchCalls.push(url);

			if (url.endsWith("/crawl/job-1")) {
				return new Response(
					JSON.stringify({
						status: "scraping",
						completed: 2,
						total: 3,
						next: "https://api.firecrawl.dev/v2/crawl/job-1?cursor=repeat",
						data: [
							{
								markdown: "# Page 1",
								metadata: {
									sourceURL: "https://example.com/page-1",
									title: "Page 1",
								},
							},
						],
					}),
					{
						status: 200,
						headers: {
							"Content-Type": "application/json",
						},
					}
				);
			}

			return new Response(
				JSON.stringify({
					next: "https://api.firecrawl.dev/v2/crawl/job-1?cursor=repeat",
					data: [
						{
							markdown: "# Page 2",
							metadata: {
								sourceURL: "https://example.com/page-2",
								title: "Page 2",
							},
						},
					],
				}),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
					},
				}
			);
		}) as typeof fetch;

		const result = await firecrawlService.getCrawlStatus("job-1", {
			includeAllPages: true,
		});

		expect(fetchCalls).toHaveLength(2);
		expect(result.status).toBe("crawling");
		expect(result.paginationTruncated).toBe(true);
		expect(result.materializedPageCount).toBe(2);
		expect(result.pages?.map((page) => page.url)).toEqual([
			"https://example.com/page-1",
			"https://example.com/page-2",
		]);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});
});

describe("FirecrawlService crawl retry metadata", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("marks crawl start 429 responses as retryable with a status code", async () => {
		const firecrawlService = new FirecrawlService("test-key");
		let fetchCount = 0;

		globalThis.fetch = (async () => {
			fetchCount++;
			return new Response("Too Many Requests", {
				status: 429,
				headers: {
					"Content-Type": "text/plain",
				},
			});
		}) as unknown as typeof fetch;

		const result = await firecrawlService.startCrawl("https://example.com", {
			maxConcurrency: 15,
		});

		expect(fetchCount).toBe(4);
		expect(result).toEqual({
			success: false,
			error: "Firecrawl API error: 429 Too Many Requests",
			statusCode: 429,
			retryable: true,
		});
	}, 15_000);

	it("marks crawl status 503 responses as retryable with a status code", async () => {
		const firecrawlService = new FirecrawlService("test-key");
		let fetchCount = 0;

		globalThis.fetch = (async () => {
			fetchCount++;
			return new Response("Service Unavailable", {
				status: 503,
				headers: {
					"Content-Type": "text/plain",
				},
			});
		}) as unknown as typeof fetch;

		const result = await firecrawlService.getCrawlStatus("job-1");

		expect(fetchCount).toBe(4);
		expect(result).toEqual({
			status: "failed",
			error: "Firecrawl API error: 503 Service Unavailable",
			statusCode: 503,
			retryable: true,
		});
	}, 15_000);
});
