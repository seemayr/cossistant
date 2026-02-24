import { upsertKnowledge } from "@api/db/queries/knowledge";
import {
	getLinkSourceById,
	getLinkSourceTotalSize,
	updateLinkSource,
} from "@api/db/queries/link-source";
import { getWebsiteById } from "@api/db/queries/website";
import { knowledge } from "@api/db/schema/knowledge";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { FirecrawlService } from "@api/services/firecrawl";
import { QUEUE_NAMES, type WebCrawlJobData } from "@cossistant/jobs";
import { getSafeRedisUrl, type RedisOptions } from "@cossistant/redis";
import { db } from "@workers/db";
import { env } from "@workers/env";
import { emitToWebsite } from "@workers/realtime";
import { type Job, Queue, QueueEvents, Worker } from "bullmq";
import { and, eq, isNull } from "drizzle-orm";

// Regex patterns (defined at top level for performance)
const TRAILING_SLASH_REGEX = /\/$/;
const LEADING_SLASH_REGEX = /^\//;

// Polling configuration
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 360; // 30 minutes max (360 * 5s)

const WORKER_CONFIG = {
	concurrency: 3,
	lockDuration: 120_000,
	stalledInterval: 30_000,
	maxStalledCount: 2,
};

// Convert MB to bytes
const MB_TO_BYTES = 1024 * 1024;

type WorkerConfig = {
	connectionOptions: RedisOptions;
	redisUrl: string;
};

/**
 * Helper to convert FeatureValue to a number limit
 */
function toNumericLimit(value: number | boolean | null): number | null {
	if (value === null || value === true) {
		return null; // unlimited
	}
	if (value === false) {
		return 0; // disabled
	}
	return value; // numeric limit
}

/**
 * Sleep helper for polling
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWebCrawlWorker({
	connectionOptions,
	redisUrl,
}: WorkerConfig) {
	const queueName = QUEUE_NAMES.WEB_CRAWL;
	const safeRedisUrl = getSafeRedisUrl(redisUrl);
	let worker: Worker<WebCrawlJobData> | null = null;
	let events: QueueEvents | null = null;
	let maintenanceQueue: Queue<WebCrawlJobData> | null = null;

	// Create Firecrawl service with the API key from workers env
	const firecrawlService = new FirecrawlService(env.FIRECRAWL_API_KEY);

	const buildConnectionOptions = (): RedisOptions => ({
		...connectionOptions,
		tls: connectionOptions.tls ? { ...connectionOptions.tls } : undefined,
	});

	return {
		start: async () => {
			if (worker) {
				return;
			}

			console.log(
				`[worker:web-crawl] Using queue=${queueName} redis=${safeRedisUrl}`
			);

			maintenanceQueue = new Queue<WebCrawlJobData>(queueName, {
				connection: buildConnectionOptions(),
			});
			await maintenanceQueue.waitUntilReady();

			events = new QueueEvents(queueName, {
				connection: buildConnectionOptions(),
			});
			events.on("failed", ({ jobId, failedReason }) => {
				console.error(
					`[worker:web-crawl] Job ${jobId} failed: ${failedReason}`
				);
			});
			await events.waitUntilReady();

			worker = new Worker<WebCrawlJobData>(
				queueName,
				async (job: Job<WebCrawlJobData>) => {
					const start = Date.now();

					try {
						await processWebCrawlJob(firecrawlService, job);
						const duration = Date.now() - start;
						console.log(
							`[worker:web-crawl] Completed ${job.data.url} in ${duration}ms`
						);
					} catch (error) {
						const duration = Date.now() - start;
						console.error(
							`[worker:web-crawl] Failed ${job.data.url} after ${duration}ms`,
							error
						);
						throw error;
					}
				},
				{
					connection: buildConnectionOptions(),
					concurrency: WORKER_CONFIG.concurrency, // Limit parallel crawls
					lockDuration: WORKER_CONFIG.lockDuration,
					stalledInterval: WORKER_CONFIG.stalledInterval,
					maxStalledCount: WORKER_CONFIG.maxStalledCount,
				}
			);

			worker.on("error", (error) => {
				console.error("[worker:web-crawl] Worker error", error);
			});

			await worker.waitUntilReady();
			console.log("[worker:web-crawl] Worker started");
		},
		stop: async () => {
			await Promise.all([
				(async () => {
					if (worker) {
						await worker.close();
						worker = null;
						console.log("[worker:web-crawl] Worker stopped");
					}
				})(),
				(async () => {
					if (events) {
						await events.close();
						events = null;
						console.log("[worker:web-crawl] Queue events stopped");
					}
				})(),
				(async () => {
					if (maintenanceQueue) {
						await maintenanceQueue.close();
						maintenanceQueue = null;
						console.log("[worker:web-crawl] Maintenance queue closed");
					}
				})(),
			]);
		},
	};
}

async function processWebCrawlJob(
	firecrawlService: FirecrawlService,
	job: Job<WebCrawlJobData>
): Promise<void> {
	const {
		linkSourceId,
		websiteId,
		organizationId,
		aiAgentId,
		url,
		crawlLimit,
		createdBy,
		includePaths,
		excludePaths,
		maxDepth = 5,
	} = job.data;

	// 1. Get the link source and validate it exists
	const linkSource = await getLinkSourceById(db, {
		id: linkSourceId,
		websiteId,
	});

	if (!linkSource) {
		console.log(`[worker:web-crawl] Link source not found: ${linkSourceId}`);
		return;
	}

	// Skip if already completed or failed (could be a duplicate job)
	if (linkSource.status === "completed" || linkSource.status === "failed") {
		return;
	}

	// 2. Check if Firecrawl is configured
	if (!firecrawlService.isConfigured()) {
		await updateLinkSource(db, {
			id: linkSourceId,
			websiteId,
			status: "failed",
			errorMessage: "Firecrawl API is not configured",
		});
		await emitCrawlFailed({
			websiteId,
			organizationId,
			linkSourceId,
			url,
			error: "Firecrawl API is not configured",
		});
		throw new Error("Firecrawl API is not configured");
	}

	// 3. Update status to crawling (v2 crawl API handles discovery internally)
	await updateLinkSource(db, {
		id: linkSourceId,
		websiteId,
		status: "crawling",
	});

	await emitLinkSourceUpdated({
		websiteId,
		organizationId,
		linkSourceId,
		status: "crawling",
	});
	await job.updateProgress(5);

	// 4. Start crawl using v2 API
	console.log(
		`[worker:web-crawl] Starting crawl: ${url} | limit=${crawlLimit} depth=${maxDepth}`
	);

	const crawlResult = await firecrawlService.startCrawl(url, {
		limit: crawlLimit,
		maxDepth,
		includePaths: includePaths ?? linkSource.includePaths ?? undefined,
		excludePaths: excludePaths ?? linkSource.excludePaths ?? undefined,
	});

	if (!(crawlResult.success && crawlResult.jobId)) {
		await updateLinkSource(db, {
			id: linkSourceId,
			websiteId,
			status: "failed",
			errorMessage: crawlResult.error ?? "Failed to start crawl",
		});
		await emitCrawlFailed({
			websiteId,
			organizationId,
			linkSourceId,
			url,
			error: crawlResult.error ?? "Failed to start crawl",
		});
		throw new Error(crawlResult.error ?? "Failed to start crawl");
	}

	// 5. Store the Firecrawl job ID
	await updateLinkSource(db, {
		id: linkSourceId,
		websiteId,
		firecrawlJobId: crawlResult.jobId,
	});

	// Emit crawlStarted event
	await emitToWebsite(websiteId, "crawlStarted", {
		websiteId,
		organizationId,
		visitorId: null,
		userId: createdBy,
		linkSourceId,
		url,
		discoveredPages: [],
		totalPagesCount: crawlLimit,
	});

	await job.updateProgress(10);

	// 6. Poll for completion with incremental page updates
	let pollAttempts = 0;
	let crawlStatus = await firecrawlService.getCrawlStatus(crawlResult.jobId);
	let lastCompletedCount = 0;
	// Track which pages we've already emitted events for (by URL)
	const emittedPageUrls = new Set<string>();

	while (
		crawlStatus.status === "crawling" &&
		pollAttempts < MAX_POLL_ATTEMPTS
	) {
		await sleep(POLL_INTERVAL_MS);
		pollAttempts++;

		// Check if the link source was deleted/cancelled during crawling
		const currentLinkSource = await getLinkSourceById(db, {
			id: linkSourceId,
			websiteId,
		});

		// If link source was deleted, abort the crawl
		if (!currentLinkSource || currentLinkSource.deletedAt) {
			console.log(
				`[worker:web-crawl] Aborting: link source ${linkSourceId} deleted`
			);
			// Cancel the Firecrawl crawl job
			await firecrawlService.cancelCrawl(crawlResult.jobId);
			return; // Exit early - no need to process results
		}

		crawlStatus = await firecrawlService.getCrawlStatus(crawlResult.jobId);

		// Update progress based on Firecrawl progress
		if (crawlStatus.progress) {
			const progressPercent =
				10 +
				Math.floor(
					(crawlStatus.progress.completed / crawlStatus.progress.total) * 70
				);
			await job.updateProgress(Math.min(progressPercent, 80));

			// Update discovered pages count
			if (crawlStatus.progress.total > 0) {
				await updateLinkSource(db, {
					id: linkSourceId,
					websiteId,
					discoveredPagesCount: crawlStatus.progress.total,
				});
			}

			// Check for newly completed pages in partial results
			if (crawlStatus.pages && crawlStatus.pages.length > 0) {
				// Emit crawlPagesDiscovered for real-time tree display
				const newPages = crawlStatus.pages.filter(
					(page) => !emittedPageUrls.has(page.url)
				);
				if (newPages.length > 0) {
					const pagesForDiscoveryEvent = newPages.map((page) => {
						try {
							const parsedUrl = new URL(page.url);
							return {
								url: page.url,
								path: parsedUrl.pathname,
								depth: calculateDepth(url, page.url),
							};
						} catch {
							return {
								url: page.url,
								path: page.url,
								depth: 0,
							};
						}
					});

					await emitToWebsite(websiteId, "crawlPagesDiscovered", {
						websiteId,
						organizationId,
						visitorId: null,
						userId: createdBy,
						linkSourceId,
						pages: pagesForDiscoveryEvent,
					});
				}

				for (const page of crawlStatus.pages) {
					if (!emittedPageUrls.has(page.url)) {
						emittedPageUrls.add(page.url);
						// Emit progress for this specific page
						await emitToWebsite(websiteId, "crawlProgress", {
							websiteId,
							organizationId,
							visitorId: null,
							userId: createdBy,
							linkSourceId,
							url,
							page: {
								url: page.url,
								title: page.title,
								status: "completed",
								sizeBytes: page.sizeBytes,
							},
							completedCount: emittedPageUrls.size,
							totalCount: crawlStatus.progress?.total ?? crawlLimit,
						});
					}
				}
			} else if (crawlStatus.progress.completed > lastCompletedCount) {
				// Fallback: emit generic progress if no partial results available
				await emitToWebsite(websiteId, "crawlProgress", {
					websiteId,
					organizationId,
					visitorId: null,
					userId: createdBy,
					linkSourceId,
					url,
					page: {
						url,
						title: null,
						status: "crawling",
					},
					completedCount: crawlStatus.progress.completed,
					totalCount: crawlStatus.progress.total,
				});
			}
			lastCompletedCount = crawlStatus.progress.completed;
		}

		// Log every 10th poll to reduce noise
		if (pollAttempts % 10 === 0) {
			console.log(
				`[worker:web-crawl] Crawling ${url} | pages=${emittedPageUrls.size} | poll=${pollAttempts}`
			);
		}
	}

	// Fetch all paginated results once the crawl is marked completed.
	// Firecrawl can paginate status data when payloads are large.
	if (crawlStatus.status === "completed") {
		crawlStatus = await firecrawlService.getCrawlStatus(crawlResult.jobId, {
			includeAllPages: true,
		});
	}

	// 7. Handle poll timeout
	if (crawlStatus.status === "crawling") {
		await updateLinkSource(db, {
			id: linkSourceId,
			websiteId,
			status: "failed",
			errorMessage: "Crawl timed out after 30 minutes",
		});
		await emitCrawlFailed({
			websiteId,
			organizationId,
			linkSourceId,
			url,
			error: "Crawl timed out after 30 minutes",
		});
		throw new Error("Crawl timed out after 30 minutes");
	}

	// 8. Handle failure
	if (crawlStatus.status === "failed") {
		let errorMessage = crawlStatus.error ?? "Crawl failed";

		// Enrich failure diagnostics with page-level Firecrawl crawl errors.
		const crawlErrorsResult = await firecrawlService.getCrawlErrors(
			crawlResult.jobId
		);
		if (
			crawlErrorsResult.success &&
			crawlErrorsResult.errors &&
			crawlErrorsResult.errors.length > 0
		) {
			const sampledErrors = crawlErrorsResult.errors
				.slice(0, 3)
				.map((entry) => {
					if (entry.url) {
						return `${entry.url}: ${entry.error}`;
					}
					return entry.error;
				})
				.join(" | ");
			errorMessage = `${errorMessage} | ${sampledErrors}`.slice(0, 1000);
		}

		await updateLinkSource(db, {
			id: linkSourceId,
			websiteId,
			status: "failed",
			errorMessage,
		});
		await emitCrawlFailed({
			websiteId,
			organizationId,
			linkSourceId,
			url,
			error: errorMessage,
		});
		throw new Error(errorMessage);
	}

	await job.updateProgress(85);

	// 9. Process results
	if (crawlStatus.status === "completed" && crawlStatus.pages) {
		// Filter out ignored URLs before processing
		const ignoredUrlsSet = new Set(linkSource.ignoredUrls ?? []);
		const validPages = crawlStatus.pages.filter(
			(page) => !ignoredUrlsSet.has(page.url)
		);

		console.log(`[worker:web-crawl] Crawl done: ${validPages.length} pages`);

		// Get plan size limits
		const website = await getWebsiteById(db, {
			orgId: organizationId,
			websiteId,
		});
		if (!website) {
			throw new Error("Website not found");
		}

		const planInfo = await getPlanForWebsite(website);
		const sizeLimitMb = toNumericLimit(
			planInfo.features["ai-agent-training-mb"]
		);
		const sizeLimitBytes =
			sizeLimitMb !== null ? sizeLimitMb * MB_TO_BYTES : null;

		// Soft delete existing knowledge entries for this link source before inserting new ones
		// This handles the recrawl case and prevents duplicate key violations
		const softDeleteTime = new Date().toISOString();
		await db
			.update(knowledge)
			.set({
				deletedAt: softDeleteTime,
				updatedAt: softDeleteTime,
			})
			.where(
				and(
					eq(knowledge.linkSourceId, linkSourceId),
					isNull(knowledge.deletedAt)
				)
			);

		// Get current total size (excluding the just-deleted entries)
		const currentTotalSize = await getLinkSourceTotalSize(db, {
			websiteId,
			aiAgentId,
		});

		let totalSizeBytes = 0;
		let crawledPagesCount = 0;
		let failedPagesCount = 0;

		// Upsert knowledge entries for each page
		for (const page of validPages) {
			// Check size limit
			const newTotalSize = currentTotalSize + totalSizeBytes + page.sizeBytes;

			if (sizeLimitBytes !== null && newTotalSize > sizeLimitBytes) {
				console.log("[worker:web-crawl] Size limit reached, stopping");
				break;
			}

			try {
				// Upsert knowledge entry (handles duplicates gracefully)
				const knowledgeEntry = await upsertKnowledge(db, {
					organizationId,
					websiteId,
					aiAgentId,
					linkSourceId,
					type: "url",
					sourceUrl: page.url,
					sourceTitle: page.title,
					origin: "crawl",
					createdBy,
					payload: {
						markdown: page.markdown,
						headings: [],
						links: [],
						images: [],
						estimatedTokens: Math.ceil(page.markdown.length / 4),
					},
					metadata: {
						source: "firecrawl-v2",
					},
					sizeBytes: page.sizeBytes,
					isIncluded: true,
				});

				totalSizeBytes += page.sizeBytes;
				crawledPagesCount++;

				// Emit crawlPageCompleted with the knowledge ID for real-time tree updates
				await emitToWebsite(websiteId, "crawlPageCompleted", {
					websiteId,
					organizationId,
					visitorId: null,
					userId: createdBy,
					linkSourceId,
					page: {
						url: page.url,
						title: page.title,
						sizeBytes: page.sizeBytes,
						knowledgeId: knowledgeEntry.id,
					},
				});

				// Also emit progress for backward compatibility
				await emitToWebsite(websiteId, "crawlProgress", {
					websiteId,
					organizationId,
					visitorId: null,
					userId: createdBy,
					linkSourceId,
					url,
					page: {
						url: page.url,
						title: page.title,
						status: "completed",
						sizeBytes: page.sizeBytes,
					},
					completedCount: crawledPagesCount,
					totalCount: validPages.length,
				});
			} catch (error) {
				console.error(
					`[worker:web-crawl] Failed to upsert knowledge for ${page.url}`,
					error
				);
				failedPagesCount++;
			}
		}

		await job.updateProgress(95);

		// 10. Update link source with results
		const now = new Date().toISOString();
		await updateLinkSource(db, {
			id: linkSourceId,
			websiteId,
			status: "completed",
			crawledPagesCount,
			totalSizeBytes,
			lastCrawledAt: now,
			errorMessage: null,
		});

		// Emit crawlCompleted event
		await emitToWebsite(websiteId, "crawlCompleted", {
			websiteId,
			organizationId,
			visitorId: null,
			userId: createdBy,
			linkSourceId,
			url,
			crawledPagesCount,
			totalSizeBytes,
			failedPagesCount,
		});

		await emitLinkSourceUpdated({
			websiteId,
			organizationId,
			linkSourceId,
			status: "completed",
			crawledPagesCount,
			totalSizeBytes,
		});

		console.log(
			`[worker:web-crawl] Saved ${crawledPagesCount} pages (${Math.round(totalSizeBytes / 1024)}KB)`
		);
	} else {
		// No pages found
		const now = new Date().toISOString();
		await updateLinkSource(db, {
			id: linkSourceId,
			websiteId,
			status: "completed",
			crawledPagesCount: 0,
			totalSizeBytes: 0,
			lastCrawledAt: now,
			errorMessage: null,
		});

		await emitToWebsite(websiteId, "crawlCompleted", {
			websiteId,
			organizationId,
			visitorId: null,
			userId: createdBy,
			linkSourceId,
			url,
			crawledPagesCount: 0,
			totalSizeBytes: 0,
			failedPagesCount: 0,
		});

		await emitLinkSourceUpdated({
			websiteId,
			organizationId,
			linkSourceId,
			status: "completed",
			crawledPagesCount: 0,
			totalSizeBytes: 0,
		});

		console.log("[worker:web-crawl] Crawl completed with no pages");
	}

	await job.updateProgress(100);
}

/**
 * Calculate depth of a URL relative to the base URL
 */
function calculateDepth(baseUrl: string, pageUrl: string): number {
	try {
		const base = new URL(baseUrl);
		const page = new URL(pageUrl);

		const basePath = base.pathname.replace(TRAILING_SLASH_REGEX, "");
		const pagePath = page.pathname.replace(TRAILING_SLASH_REGEX, "");

		const relativePath = pagePath
			.replace(basePath, "")
			.replace(LEADING_SLASH_REGEX, "");

		if (!relativePath) {
			return 0;
		}

		return relativePath.split("/").filter(Boolean).length;
	} catch {
		return 0;
	}
}

type CrawlFailedParams = {
	websiteId: string;
	organizationId: string;
	linkSourceId: string;
	url: string;
	error: string;
};

/**
 * Helper to emit crawlFailed event
 */
async function emitCrawlFailed(params: CrawlFailedParams): Promise<void> {
	const { websiteId, organizationId, linkSourceId, url, error } = params;
	await emitToWebsite(websiteId, "crawlFailed", {
		websiteId,
		organizationId,
		visitorId: null,
		userId: null,
		linkSourceId,
		url,
		error,
	});
}

type LinkSourceUpdatedParams = {
	websiteId: string;
	organizationId: string;
	linkSourceId: string;
	status: "pending" | "mapping" | "crawling" | "completed" | "failed";
	discoveredPagesCount?: number;
	crawledPagesCount?: number;
	totalSizeBytes?: number;
	errorMessage?: string | null;
};

/**
 * Helper to emit linkSourceUpdated event
 */
async function emitLinkSourceUpdated(
	params: LinkSourceUpdatedParams
): Promise<void> {
	const { websiteId, organizationId, linkSourceId, status, ...additionalData } =
		params;
	await emitToWebsite(websiteId, "linkSourceUpdated", {
		websiteId,
		organizationId,
		visitorId: null,
		userId: null,
		linkSourceId,
		status,
		...additionalData,
	});
}
