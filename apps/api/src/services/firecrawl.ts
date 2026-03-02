import { env } from "@api/env";

// Regex patterns for URL filtering (defined at top level for performance)
const TRAILING_SLASH_REGEX = /\/$/;
const LEADING_SLASH_REGEX = /^\//;
const REGEX_SPECIAL_CHARS_REGEX = /[.*+?^${}()|[\]\\]/g;
const REGEX_HINT_REGEX = /[[\]()+?^$|\\]/;

const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v2";
const FIRECRAWL_REQUEST_TIMEOUT_MS = 30_000;
const FIRECRAWL_MAX_RETRIES = 3;
const FIRECRAWL_RETRY_BASE_DELAY_MS = 500;
const FIRECRAWL_MAX_ERROR_BODY_LENGTH = 500;
const FIRECRAWL_MAX_PAGINATION_REQUESTS = 200;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

type FirecrawlScrapeOptions = {
	formats?: Array<"markdown" | "html">;
	/** Only return the main content of the page (excludes nav, headers, footers) */
	onlyMainContent?: boolean;
	/** HTML tags to include (e.g., ["p", "h1", "article"]) */
	includeTags?: string[];
	/** HTML tags to exclude (e.g., ["nav", "footer", ".sidebar"]) */
	excludeTags?: string[];
	/** Remove base64 images from extracted content */
	removeBase64Images?: boolean;
	/** Custom parsers to use */
	parsers?: string[];
};

// Batch scrape API types
type FirecrawlBatchScrapeParams = {
	urls: string[];
	formats?: Array<"markdown" | "html">;
	onlyMainContent?: boolean;
	includeTags?: string[];
	excludeTags?: string[];
};

type FirecrawlBatchScrapeResponse = {
	success?: boolean;
	id?: string;
	url?: string;
	error?: string;
};

type FirecrawlPageMetadata = {
	title?: string;
	description?: string;
	sourceURL?: string;
	sourceUrl?: string;
	url?: string;
	ogTitle?: string;
	ogDescription?: string;
	ogImage?: string;
	favicon?: string;
	language?: string;
	keywords?: string;
};

type FirecrawlPageData = {
	markdown?: string;
	html?: string;
	metadata?: FirecrawlPageMetadata;
};

type FirecrawlStatusResponseBase = {
	success?: boolean;
	status?: string;
	completed?: number;
	total?: number;
	creditsUsed?: number;
	expiresAt?: string;
	next?: string;
	data?: FirecrawlPageData[];
	error?: string;
};

type FirecrawlBatchScrapeStatusResponse = FirecrawlStatusResponseBase;

type FirecrawlCrawlParams = {
	limit?: number;
	/** Maximum depth of links to follow from the starting URL */
	maxDiscoveryDepth?: number;
	includePaths?: string[];
	excludePaths?: string[];
	sitemap?: "include" | "skip" | "only";
	ignoreQueryParameters?: boolean;
	crawlEntireDomain?: boolean;
	allowSubdomains?: boolean;
	maxConcurrency?: number;
	delay?: number;
	scrapeOptions?: FirecrawlScrapeOptions;
};

type FirecrawlCrawlResponse = {
	success?: boolean;
	id?: string;
	error?: string;
};

type FirecrawlScrapeResponse = {
	success?: boolean;
	data?: FirecrawlPageData;
	error?: string;
};

type FirecrawlCrawlStatusResponse = FirecrawlStatusResponseBase;

type FirecrawlMapLink =
	| string
	| {
			url?: string;
			title?: string;
			description?: string;
	  };

// Firecrawl Map API response type
type FirecrawlMapResponse = {
	success?: boolean;
	links?: FirecrawlMapLink[];
	error?: string;
};

type FirecrawlCrawlError = {
	error?: string;
	url?: string;
	documentUrl?: string;
	document_url?: string;
};

type FirecrawlCrawlErrorsResponse = {
	success?: boolean;
	data?: FirecrawlCrawlError[];
	error?: string;
};

export type CrawlResult = {
	success: boolean;
	jobId?: string;
	error?: string;
};

export type CrawlStatus = {
	status: "pending" | "crawling" | "completed" | "failed";
	progress?: {
		completed: number;
		total: number;
	};
	pages?: Array<{
		url: string;
		title: string | null;
		markdown: string;
		sizeBytes: number;
	}>;
	error?: string;
};

export type CrawlErrorDetails = {
	url: string | null;
	error: string;
};

export type ScrapeResult = {
	success: boolean;
	data?: {
		markdown: string;
		html?: string;
		title?: string;
		description?: string;
		ogTitle?: string;
		ogDescription?: string;
		ogImage?: string;
		favicon?: string;
		language?: string;
		keywords?: string;
		sourceUrl: string;
	};
	error?: string;
};

export type BrandInfo = {
	success: boolean;
	companyName?: string;
	description?: string;
	logo?: string;
	favicon?: string;
	language?: string;
	keywords?: string;
	/** Full markdown content from the page, used for prompt generation */
	markdown?: string;
	error?: string;
};

/**
 * Map result - discovered URLs from a website
 */
export type MapResult = {
	success: boolean;
	urls?: string[];
	error?: string;
};

/**
 * Batch scrape result - async job started
 */
export type BatchScrapeResult = {
	success: boolean;
	jobId?: string;
	error?: string;
};

/**
 * Batch scrape status - current state of batch scrape job
 */
export type BatchScrapeStatus = {
	status: "pending" | "scraping" | "completed" | "failed";
	progress?: {
		completed: number;
		total: number;
	};
	pages?: Array<{
		url: string;
		title: string | null;
		markdown: string;
		sizeBytes: number;
	}>;
	error?: string;
};

/**
 * Options for batch scraping
 */
export type BatchScrapeOptions = {
	/** Only return the main content of the page (excludes nav, headers, footers). Default: true */
	onlyMainContent?: boolean;
	/** HTML tags to include */
	includeTags?: string[];
	/** HTML tags to exclude */
	excludeTags?: string[];
};

/**
 * Options for mapSite
 */
export type MapOptions = {
	/** Search query to filter URLs */
	search?: string;
	/** Ignore sitemap and only use links found on the page */
	ignoreSitemap?: boolean;
	/** Only use URLs from sitemap, ignore discovered links */
	sitemapOnly?: boolean;
	/** Include URLs from subdomains */
	includeSubdomains?: boolean;
	/** Maximum number of URLs to return (max 5000) */
	limit?: number;
	/** Firecrawl v2 map option for bypassing cache */
	ignoreCache?: boolean;
};

const FIRECRAWL_MAP_OPTION_KEYS = new Set<keyof MapOptions>([
	"search",
	"ignoreSitemap",
	"sitemapOnly",
	"includeSubdomains",
	"limit",
	"ignoreCache",
]);

type SanitizedMapOptions = {
	search?: string;
	ignoreSitemap?: boolean;
	sitemapOnly?: boolean;
	includeSubdomains: boolean;
	limit: number;
	ignoreCache?: boolean;
};

function sanitizeMapOptions(options: MapOptions): {
	sanitized: SanitizedMapOptions;
	unknownKeys: string[];
} {
	const unknownKeys = Object.keys(options as Record<string, unknown>).filter(
		(key) => !FIRECRAWL_MAP_OPTION_KEYS.has(key as keyof MapOptions)
	);

	const sanitized: SanitizedMapOptions = {
		includeSubdomains: options.includeSubdomains ?? false,
		limit: options.limit ?? 100,
	};

	if (options.search) {
		sanitized.search = options.search;
	}

	if (options.ignoreSitemap) {
		sanitized.ignoreSitemap = true;
	}

	if (options.sitemapOnly) {
		sanitized.sitemapOnly = true;
	}

	if (options.ignoreCache !== undefined) {
		sanitized.ignoreCache = options.ignoreCache;
	}

	return {
		sanitized,
		unknownKeys,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(value: string): string {
	return value.replace(REGEX_SPECIAL_CHARS_REGEX, "\\$&");
}

function isLikelyRegexPattern(pattern: string): boolean {
	return (
		pattern.startsWith("^") ||
		pattern.endsWith("$") ||
		pattern.includes(".*") ||
		REGEX_HINT_REGEX.test(pattern)
	);
}

function toFirecrawlPathPattern(rawPattern: string): string {
	const pattern = rawPattern.trim();
	if (!pattern) {
		return "";
	}

	if (isLikelyRegexPattern(pattern)) {
		return pattern;
	}

	if (pattern.includes("*")) {
		return `^${pattern
			.split("*")
			.map((part) => escapeRegex(part))
			.join(".*")}$`;
	}

	const normalized = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
	return `^${escapeRegex(normalized)}(?:/.*)?$`;
}

function normalizePathPatterns(
	patterns?: string[] | null
): string[] | undefined {
	if (!patterns || patterns.length === 0) {
		return;
	}

	const normalized = patterns
		.map((pattern) => toFirecrawlPathPattern(pattern))
		.filter((pattern) => pattern.length > 0);

	return normalized.length > 0 ? normalized : undefined;
}

function truncateErrorBody(errorBody: string): string {
	if (errorBody.length <= FIRECRAWL_MAX_ERROR_BODY_LENGTH) {
		return errorBody;
	}

	return `${errorBody.slice(0, FIRECRAWL_MAX_ERROR_BODY_LENGTH)}...`;
}

function isRetryableError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	if (error.name === "AbortError") {
		return true;
	}

	const message = error.message.toLowerCase();
	return (
		message.includes("fetch failed") ||
		message.includes("timed out") ||
		message.includes("timeout") ||
		message.includes("socket") ||
		message.includes("econnreset") ||
		message.includes("enotfound")
	);
}

function retryDelayMs(attempt: number): number {
	const exponential = FIRECRAWL_RETRY_BASE_DELAY_MS * 2 ** attempt;
	const jitter = Math.floor(Math.random() * 250);
	return Math.min(exponential + jitter, 5000);
}

function resolvePageUrl(metadata?: FirecrawlPageMetadata): string | null {
	return metadata?.sourceURL ?? metadata?.sourceUrl ?? metadata?.url ?? null;
}

function normalizePages(pages: FirecrawlPageData[] | undefined): Array<{
	url: string;
	title: string | null;
	markdown: string;
	sizeBytes: number;
}> {
	if (!pages || pages.length === 0) {
		return [];
	}

	const dedupedByUrl = new Map<
		string,
		{
			url: string;
			title: string | null;
			markdown: string;
			sizeBytes: number;
		}
	>();

	for (const page of pages) {
		const markdown = page.markdown ?? "";
		if (!markdown) {
			continue;
		}

		const sourceUrl = resolvePageUrl(page.metadata);
		if (!sourceUrl || dedupedByUrl.has(sourceUrl)) {
			continue;
		}

		dedupedByUrl.set(sourceUrl, {
			url: sourceUrl,
			title: page.metadata?.title ?? page.metadata?.ogTitle ?? null,
			markdown,
			sizeBytes: new TextEncoder().encode(markdown).length,
		});
	}

	return Array.from(dedupedByUrl.values());
}

/**
 * Firecrawl service for web crawling
 */
export class FirecrawlService {
	private apiKey: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey ?? env.FIRECRAWL_API_KEY;
		if (!this.apiKey) {
			console.warn(
				"Firecrawl API key not configured. Web crawling will not work."
			);
		}
	}

	/**
	 * Check if Firecrawl is configured
	 */
	isConfigured(): boolean {
		return Boolean(this.apiKey);
	}

	private buildUrl(pathOrUrl: string): string {
		if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
			return pathOrUrl;
		}

		return `${FIRECRAWL_API_BASE}${pathOrUrl}`;
	}

	private async requestWithRetry(
		pathOrUrl: string,
		init: RequestInit
	): Promise<Response> {
		let attempt = 0;

		while (true) {
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				FIRECRAWL_REQUEST_TIMEOUT_MS
			);

			try {
				const response = await fetch(this.buildUrl(pathOrUrl), {
					...init,
					signal: controller.signal,
				});

				if (
					RETRYABLE_STATUS_CODES.has(response.status) &&
					attempt < FIRECRAWL_MAX_RETRIES
				) {
					attempt++;
					await sleep(retryDelayMs(attempt));
					continue;
				}

				return response;
			} catch (error) {
				if (attempt < FIRECRAWL_MAX_RETRIES && isRetryableError(error)) {
					attempt++;
					await sleep(retryDelayMs(attempt));
					continue;
				}

				throw error;
			} finally {
				clearTimeout(timeout);
			}
		}
	}

	private async readErrorBody(response: Response): Promise<string> {
		const body = await response.text();
		return truncateErrorBody(body || "No error body");
	}

	private async collectPaginatedPages(
		nextUrl?: string
	): Promise<FirecrawlPageData[]> {
		if (!nextUrl) {
			return [];
		}

		const pages: FirecrawlPageData[] = [];
		let cursor: string | undefined = nextUrl;
		let requests = 0;

		while (cursor && requests < FIRECRAWL_MAX_PAGINATION_REQUESTS) {
			requests++;

			const response = await this.requestWithRetry(cursor, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				console.error("[firecrawl] Failed to fetch paginated crawl results", {
					status: response.status,
					error: errorText,
				});
				break;
			}

			const data = (await response.json()) as {
				data?: FirecrawlPageData[];
				next?: string;
			};

			if (data.data && data.data.length > 0) {
				pages.push(...data.data);
			}

			cursor = data.next;
		}

		if (cursor) {
			console.warn(
				"[firecrawl] Pagination truncated after max requests. Consider reducing crawl scope."
			);
		}

		return pages;
	}

	/**
	 * Start an async crawl job using v2 API
	 * @param url - The URL to crawl
	 * @param options - Crawl configuration options
	 */
	async startCrawl(
		url: string,
		options: {
			limit?: number;
			/** Maximum depth of links to follow from the starting URL */
			maxDepth?: number;
			includePaths?: string[];
			excludePaths?: string[];
			sitemapMode?: "include" | "skip" | "only";
			ignoreSitemap?: boolean;
			ignoreQueryParameters?: boolean;
			crawlEntireDomain?: boolean;
			allowSubdomains?: boolean;
			maxConcurrency?: number;
			delay?: number;
		} = {}
	): Promise<CrawlResult> {
		if (!this.isConfigured()) {
			return {
				success: false,
				error: "Firecrawl API key not configured",
			};
		}

		const { limit = 100, maxDepth = 5, includePaths, excludePaths } = options;

		try {
			const crawlParams: { url: string } & FirecrawlCrawlParams = {
				url,
				limit,
				maxDiscoveryDepth: maxDepth,
				// Better default for KB quality/cost: avoid duplicate pages by query string
				ignoreQueryParameters: options.ignoreQueryParameters ?? true,
				sitemap: options.ignoreSitemap
					? "skip"
					: (options.sitemapMode ?? "include"),
				scrapeOptions: {
					formats: ["markdown"],
					// Cleaner extracts (excludes nav, headers, footers)
					onlyMainContent: true,
					removeBase64Images: true,
				},
			};

			const normalizedIncludePaths = normalizePathPatterns(includePaths);
			if (normalizedIncludePaths) {
				crawlParams.includePaths = normalizedIncludePaths;
			}

			const normalizedExcludePaths = normalizePathPatterns(excludePaths);
			if (normalizedExcludePaths) {
				crawlParams.excludePaths = normalizedExcludePaths;
			}

			if (options.crawlEntireDomain !== undefined) {
				crawlParams.crawlEntireDomain = options.crawlEntireDomain;
			}
			if (options.allowSubdomains !== undefined) {
				crawlParams.allowSubdomains = options.allowSubdomains;
			}
			if (options.maxConcurrency !== undefined) {
				crawlParams.maxConcurrency = options.maxConcurrency;
			}
			if (options.delay !== undefined) {
				crawlParams.delay = options.delay;
			}

			const response = await this.requestWithRetry("/crawl", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(crawlParams),
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				return {
					success: false,
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			const data = (await response.json()) as FirecrawlCrawlResponse;

			if (!(data.success !== false && data.id)) {
				return {
					success: false,
					error: data.error ?? "Unknown error starting crawl",
				};
			}

			return {
				success: true,
				jobId: data.id,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				success: false,
				error: `Failed to start crawl: ${message}`,
			};
		}
	}

	/**
	 * Get the status of a crawl job
	 */
	async getCrawlStatus(
		jobId: string,
		options: { includeAllPages?: boolean } = {}
	): Promise<CrawlStatus> {
		if (!this.isConfigured()) {
			return {
				status: "failed",
				error: "Firecrawl API key not configured",
			};
		}

		try {
			const response = await this.requestWithRetry(`/crawl/${jobId}`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				return {
					status: "failed",
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			const data = (await response.json()) as FirecrawlCrawlStatusResponse;

			if (!data.status) {
				return {
					status: "failed",
					error: data.error ?? "Invalid response checking crawl status",
				};
			}

			const statusMap: Record<string, CrawlStatus["status"]> = {
				queued: "pending",
				scraping: "crawling",
				completed: "completed",
				failed: "failed",
				cancelled: "failed",
			};

			const status = statusMap[data.status] ?? "pending";

			let allPages = data.data ?? [];
			if (options.includeAllPages && data.next) {
				allPages = [
					...allPages,
					...(await this.collectPaginatedPages(data.next)),
				];
			}

			const normalizedPages = normalizePages(allPages);
			const result: CrawlStatus = {
				status,
				progress:
					data.completed !== undefined && data.total !== undefined
						? {
								completed: data.completed,
								total: data.total,
							}
						: undefined,
				pages: normalizedPages.length > 0 ? normalizedPages : undefined,
			};

			if (status === "failed") {
				result.error = data.error ?? "Crawl failed";
			}

			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				status: "failed",
				error: `Failed to get crawl status: ${message}`,
			};
		}
	}

	/**
	 * Get crawl page-level errors for better diagnostics when a crawl fails.
	 */
	async getCrawlErrors(jobId: string): Promise<{
		success: boolean;
		errors?: CrawlErrorDetails[];
		error?: string;
	}> {
		if (!this.isConfigured()) {
			return {
				success: false,
				error: "Firecrawl API key not configured",
			};
		}

		try {
			const response = await this.requestWithRetry(`/crawl/${jobId}/errors`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				return {
					success: false,
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			const data = (await response.json()) as FirecrawlCrawlErrorsResponse;
			if (data.success === false) {
				return {
					success: false,
					error: data.error ?? "Unknown error getting crawl errors",
				};
			}

			const errors = (data.data ?? [])
				.filter((entry) => Boolean(entry.error))
				.map((entry) => ({
					url: entry.url ?? entry.documentUrl ?? entry.document_url ?? null,
					error: entry.error ?? "Unknown crawl error",
				}));

			return {
				success: true,
				errors,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				success: false,
				error: `Failed to get crawl errors: ${message}`,
			};
		}
	}

	/**
	 * Cancel a crawl job
	 */
	async cancelCrawl(
		jobId: string
	): Promise<{ success: boolean; error?: string }> {
		if (!this.isConfigured()) {
			return {
				success: false,
				error: "Firecrawl API key not configured",
			};
		}

		try {
			const response = await this.requestWithRetry(`/crawl/${jobId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				return {
					success: false,
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				success: false,
				error: `Failed to cancel crawl: ${message}`,
			};
		}
	}

	/**
	 * Start an async batch scrape job for multiple URLs
	 * More efficient than crawl when URLs are already known (e.g., from mapSite)
	 * Uses onlyMainContent by default for cleaner, smaller extracts
	 *
	 * @param urls - Array of URLs to scrape (max 1000)
	 * @param options - Batch scrape configuration options
	 */
	async startBatchScrape(
		urls: string[],
		options: BatchScrapeOptions = {}
	): Promise<BatchScrapeResult> {
		if (!this.isConfigured()) {
			return {
				success: false,
				error: "Firecrawl API key not configured",
			};
		}

		if (urls.length === 0) {
			return {
				success: false,
				error: "No URLs provided for batch scrape",
			};
		}

		// Limit to 1000 URLs per batch (Firecrawl limit)
		const urlsToScrape = urls.slice(0, 1000);

		try {
			const batchParams: FirecrawlBatchScrapeParams = {
				urls: urlsToScrape,
				formats: ["markdown"],
				// Enable onlyMainContent by default for cleaner extracts
				onlyMainContent: options.onlyMainContent ?? true,
			};

			// Only include tag filters if specified
			if (options.includeTags && options.includeTags.length > 0) {
				batchParams.includeTags = options.includeTags;
			}
			if (options.excludeTags && options.excludeTags.length > 0) {
				batchParams.excludeTags = options.excludeTags;
			}

			const response = await this.requestWithRetry("/batch/scrape", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(batchParams),
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				return {
					success: false,
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			const data = (await response.json()) as FirecrawlBatchScrapeResponse;

			if (!(data.success !== false && data.id)) {
				return {
					success: false,
					error: data.error ?? "Unknown error starting batch scrape",
				};
			}

			return {
				success: true,
				jobId: data.id,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				success: false,
				error: `Failed to start batch scrape: ${message}`,
			};
		}
	}

	/**
	 * Get the status of a batch scrape job
	 */
	async getBatchScrapeStatus(
		jobId: string,
		options: { includeAllPages?: boolean } = {}
	): Promise<BatchScrapeStatus> {
		if (!this.isConfigured()) {
			return {
				status: "failed",
				error: "Firecrawl API key not configured",
			};
		}

		try {
			const response = await this.requestWithRetry(`/batch/scrape/${jobId}`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				return {
					status: "failed",
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			const data =
				(await response.json()) as FirecrawlBatchScrapeStatusResponse;

			if (!data.status) {
				return {
					status: "failed",
					error: data.error ?? "Invalid response checking batch scrape status",
				};
			}

			// Map Firecrawl status to our internal status
			const statusMap: Record<string, BatchScrapeStatus["status"]> = {
				queued: "pending",
				scraping: "scraping",
				completed: "completed",
				failed: "failed",
				cancelled: "failed",
			};

			const status = statusMap[data.status] ?? "pending";

			let allPages = data.data ?? [];
			if (options.includeAllPages && data.next) {
				allPages = [
					...allPages,
					...(await this.collectPaginatedPages(data.next)),
				];
			}

			const normalizedPages = normalizePages(allPages);
			const result: BatchScrapeStatus = {
				status,
				progress:
					data.completed !== undefined && data.total !== undefined
						? {
								completed: data.completed,
								total: data.total,
							}
						: undefined,
				pages: normalizedPages.length > 0 ? normalizedPages : undefined,
			};

			if (status === "failed") {
				result.error = data.error ?? "Batch scrape failed";
			}

			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				status: "failed",
				error: `Failed to get batch scrape status: ${message}`,
			};
		}
	}

	/**
	 * Cancel a batch scrape job
	 */
	async cancelBatchScrape(
		jobId: string
	): Promise<{ success: boolean; error?: string }> {
		if (!this.isConfigured()) {
			return {
				success: false,
				error: "Firecrawl API key not configured",
			};
		}

		try {
			const response = await this.requestWithRetry(`/batch/scrape/${jobId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
				},
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				return {
					success: false,
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				success: false,
				error: `Failed to cancel batch scrape: ${message}`,
			};
		}
	}

	/**
	 * Scrape a single page (synchronous, returns immediately with content)
	 * Uses Firecrawl v2 API with optional cache age for better onboarding speed.
	 * Useful for extracting brand information from a homepage.
	 */
	async scrapeSinglePage(
		url: string,
		options?: {
			/** Max cache age in milliseconds */
			maxAge?: number;
		}
	): Promise<ScrapeResult> {
		if (!this.isConfigured()) {
			return {
				success: false,
				error: "Firecrawl API key not configured",
			};
		}

		console.log("[firecrawl] scrapeSinglePage called for:", url);

		try {
			const requestBody: Record<string, unknown> = {
				url,
				formats: ["markdown", "html"],
				// Keep full page for meta tags extraction
				onlyMainContent: false,
			};

			if (options?.maxAge !== undefined) {
				requestBody.maxAge = options.maxAge;
			}

			console.log("[firecrawl] Scrape request body:", requestBody);

			const response = await this.requestWithRetry("/scrape", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				console.error("[firecrawl] API error response:", {
					status: response.status,
					body: errorText,
				});
				return {
					success: false,
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			const data = (await response.json()) as FirecrawlScrapeResponse;

			console.log("[firecrawl] Raw API response:", {
				success: data.success,
				hasData: !!data.data,
				metadata: data.data?.metadata,
				markdownLength: data.data?.markdown?.length ?? 0,
				error: data.error,
			});

			if (!data.data) {
				return {
					success: false,
					error: data.error ?? "Unknown error scraping page",
				};
			}

			const result = {
				success: true,
				data: {
					markdown: data.data.markdown ?? "",
					html: data.data.html,
					title: data.data.metadata?.title ?? data.data.metadata?.ogTitle,
					description:
						data.data.metadata?.description ??
						data.data.metadata?.ogDescription,
					ogTitle: data.data.metadata?.ogTitle,
					ogDescription: data.data.metadata?.ogDescription,
					ogImage: data.data.metadata?.ogImage,
					favicon: data.data.metadata?.favicon,
					language: data.data.metadata?.language,
					keywords: data.data.metadata?.keywords,
					sourceUrl: resolvePageUrl(data.data.metadata) ?? url,
				},
			};

			console.log("[firecrawl] Parsed scrape result:", {
				title: result.data.title,
				description: result.data.description?.substring(0, 100),
				ogDescription: result.data.ogDescription?.substring(0, 100),
				hasMarkdown: !!result.data.markdown,
				markdownLength: result.data.markdown.length,
			});

			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error("[firecrawl] Scrape exception:", message);
			return {
				success: false,
				error: `Failed to scrape page: ${message}`,
			};
		}
	}

	/**
	 * Map a website to discover all URLs
	 * Uses Firecrawl v2 /map endpoint to quickly discover pages without scraping content.
	 */
	async mapSite(url: string, options: MapOptions = {}): Promise<MapResult> {
		if (!this.isConfigured()) {
			return {
				success: false,
				error: "Firecrawl API key not configured",
			};
		}

		console.log("[firecrawl] mapSite called for:", url, "options:", options);

		try {
			const { sanitized: sanitizedOptions, unknownKeys } =
				sanitizeMapOptions(options);
			if (unknownKeys.length > 0) {
				console.warn("[firecrawl] mapSite dropping unsupported options", {
					unknownKeys,
				});
			}

			const requestBody: Record<string, unknown> = {
				url,
				includeSubdomains: sanitizedOptions.includeSubdomains,
				limit: sanitizedOptions.limit,
			};

			if (sanitizedOptions.search) {
				requestBody.search = sanitizedOptions.search;
			}

			if (sanitizedOptions.sitemapOnly) {
				requestBody.sitemap = "only";
			} else if (sanitizedOptions.ignoreSitemap) {
				requestBody.sitemap = "skip";
			}

			if (sanitizedOptions.ignoreCache !== undefined) {
				requestBody.ignoreCache = sanitizedOptions.ignoreCache;
			}

			const response = await this.requestWithRetry("/map", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await this.readErrorBody(response);
				console.error("[firecrawl] Map API error:", {
					status: response.status,
					body: errorText,
				});
				return {
					success: false,
					error: `Firecrawl API error: ${response.status} ${errorText}`,
				};
			}

			const data = (await response.json()) as FirecrawlMapResponse;
			if (data.success === false) {
				return {
					success: false,
					error: data.error ?? "Unknown error mapping site",
				};
			}

			const urls = (data.links ?? [])
				.map((entry) => (typeof entry === "string" ? entry : entry.url))
				.filter((entry): entry is string => Boolean(entry));

			console.log("[firecrawl] Map API response:", {
				success: data.success,
				linksCount: urls.length,
				error: data.error,
			});

			return {
				success: true,
				urls,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error("[firecrawl] Map exception:", message);
			return {
				success: false,
				error: `Failed to map site: ${message}`,
			};
		}
	}

	/**
	 * Filter URLs based on include/exclude paths
	 * Include paths: only URLs matching at least one include path
	 * Exclude paths: skip URLs matching any exclude path
	 */
	filterUrls(
		urls: string[],
		options: {
			includePaths?: string[] | null;
			excludePaths?: string[] | null;
			maxDepth?: number;
			baseUrl?: string;
		} = {}
	): string[] {
		const { includePaths, excludePaths, maxDepth = 1, baseUrl } = options;

		return urls.filter((urlStr) => {
			try {
				const url = new URL(urlStr);
				const path = url.pathname;

				// Filter by depth (count path segments)
				if (baseUrl) {
					const baseUrlObj = new URL(baseUrl);
					const basePath = baseUrlObj.pathname.replace(
						TRAILING_SLASH_REGEX,
						""
					);
					const relativePath = path
						.replace(basePath, "")
						.replace(LEADING_SLASH_REGEX, "");
					const depth = relativePath
						? relativePath.split("/").filter(Boolean).length
						: 0;

					if (depth > maxDepth) {
						return false;
					}
				}

				// If include paths specified, URL must match at least one
				if (includePaths && includePaths.length > 0) {
					const matchesInclude = includePaths.some((pattern) => {
						if (pattern.endsWith("*")) {
							return path.startsWith(pattern.slice(0, -1));
						}
						return path === pattern || path.startsWith(`${pattern}/`);
					});
					if (!matchesInclude) {
						return false;
					}
				}

				// If exclude paths specified, URL must not match any
				if (excludePaths && excludePaths.length > 0) {
					const matchesExclude = excludePaths.some((pattern) => {
						if (pattern.endsWith("*")) {
							return path.startsWith(pattern.slice(0, -1));
						}
						return path === pattern || path.startsWith(`${pattern}/`);
					});
					if (matchesExclude) {
						return false;
					}
				}

				return true;
			} catch {
				// Invalid URL, exclude it
				return false;
			}
		});
	}

	/**
	 * Extract brand information from a website's homepage
	 * Uses scrapeSinglePage and extracts relevant brand metadata
	 */
	async extractBrandInfo(
		url: string,
		options?: { maxAge?: number }
	): Promise<BrandInfo> {
		console.log("[firecrawl] extractBrandInfo called for:", url);
		const scrapeResult = await this.scrapeSinglePage(url, options);

		// Log raw scrape result for debugging
		console.log("[firecrawl] Raw scrape result:", {
			success: scrapeResult.success,
			hasData: !!scrapeResult.data,
			title: scrapeResult.data?.title,
			ogTitle: scrapeResult.data?.ogTitle,
			description: scrapeResult.data?.description?.substring(0, 100),
			ogDescription: scrapeResult.data?.ogDescription?.substring(0, 100),
			markdownLength: scrapeResult.data?.markdown?.length ?? 0,
			error: scrapeResult.error,
		});

		if (!scrapeResult.success) {
			return {
				success: false,
				error: scrapeResult.error ?? "Failed to scrape website",
			};
		}

		if (!scrapeResult.data) {
			return {
				success: false,
				error: "No data returned from scrape",
			};
		}

		// Extract company name from title or OG title
		// Try to get a clean company name by removing common suffixes
		let companyName = scrapeResult.data.ogTitle ?? scrapeResult.data.title;
		if (companyName) {
			// Remove common separators and trailing parts (e.g., "Acme | Home" -> "Acme")
			const separators = [" | ", " - ", " – ", " — ", " :: "];
			for (const sep of separators) {
				if (companyName.includes(sep)) {
					const firstPart = companyName.split(sep)[0];
					if (firstPart) {
						companyName = firstPart.trim();
					}
					break;
				}
			}
		}

		const brandInfo = {
			success: true,
			companyName,
			description:
				scrapeResult.data.ogDescription ?? scrapeResult.data.description,
			logo: scrapeResult.data.ogImage,
			favicon: scrapeResult.data.favicon,
			language: scrapeResult.data.language,
			keywords: scrapeResult.data.keywords,
			markdown: scrapeResult.data.markdown,
		};

		console.log("[firecrawl] Extracted brand info:", {
			companyName: brandInfo.companyName,
			description: brandInfo.description?.substring(0, 100),
			hasMarkdown: !!brandInfo.markdown,
		});

		return brandInfo;
	}
}

// Export a singleton instance
export const firecrawlService = new FirecrawlService();
