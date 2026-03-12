import { upsertKnowledge } from "@api/db/queries/knowledge";
import {
	getLinkSourceById,
	getLinkSourceTotalSize,
	updateLinkSource,
} from "@api/db/queries/link-source";
import { getWebsiteById } from "@api/db/queries/website";
import { knowledge } from "@api/db/schema/knowledge";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { type CrawlStatus, FirecrawlService } from "@api/services/firecrawl";
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
const STALL_THRESHOLD_MS = 60_000; // Fail fast after 60s with no visible progress
const LINK_SOURCE_CHECK_INTERVAL_POLLS = 3;
const PROGRESS_LOG_INTERVAL_POLLS = 10;
const ACTIVE_CRAWL_STATUSES = new Set<CrawlStatus["status"]>([
	"pending",
	"crawling",
]);

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

type FirecrawlJobClient = Pick<
	FirecrawlService,
	| "isConfigured"
	| "startCrawl"
	| "getCrawlStatus"
	| "cancelCrawl"
	| "getCrawlErrors"
>;

export type WebCrawlWorkerRuntime = {
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	pollIntervalMs: number;
	maxPollAttempts: number;
	stallThresholdMs: number;
	linkSourceCheckIntervalPolls: number;
	progressLogIntervalPolls: number;
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

const DEFAULT_WEB_CRAWL_RUNTIME: WebCrawlWorkerRuntime = {
	now: () => Date.now(),
	sleep,
	pollIntervalMs: POLL_INTERVAL_MS,
	maxPollAttempts: MAX_POLL_ATTEMPTS,
	stallThresholdMs: STALL_THRESHOLD_MS,
	linkSourceCheckIntervalPolls: LINK_SOURCE_CHECK_INTERVAL_POLLS,
	progressLogIntervalPolls: PROGRESS_LOG_INTERVAL_POLLS,
};

function isActiveCrawlStatus(status: CrawlStatus["status"]): boolean {
	return ACTIVE_CRAWL_STATUSES.has(status);
}

function hasReachedReportedCompletion(crawlStatus: CrawlStatus): boolean {
	const progress = crawlStatus.progress;
	return Boolean(
		progress && progress.total > 0 && progress.completed >= progress.total
	);
}

function canTreatCrawlAsCompleted(crawlStatus: CrawlStatus): boolean {
	if (crawlStatus.status === "completed") {
		return true;
	}

	return (
		isActiveCrawlStatus(crawlStatus.status) &&
		hasReachedReportedCompletion(crawlStatus) &&
		Boolean(crawlStatus.pages?.length)
	);
}

function asCompletedCrawlStatus(crawlStatus: CrawlStatus): CrawlStatus {
	if (crawlStatus.status === "completed") {
		return crawlStatus;
	}

	return {
		...crawlStatus,
		status: "completed",
	};
}

function getProgressSnapshot(
	crawlStatus: CrawlStatus,
	discoveredPagesCount: number
): string {
	const completed = crawlStatus.progress?.completed ?? 0;
	const total = crawlStatus.progress?.total ?? 0;
	return `${completed}:${total}:${discoveredPagesCount}`;
}

async function cancelRemoteCrawl(
	firecrawlService: FirecrawlJobClient,
	jobId: string,
	reason: string
): Promise<void> {
	try {
		const result = await firecrawlService.cancelCrawl(jobId);
		if (!result.success) {
			console.warn(
				`[worker:web-crawl] Failed to cancel Firecrawl job ${jobId} after ${reason}: ${result.error ?? "unknown error"}`
			);
		}
	} catch (error) {
		console.error(
			`[worker:web-crawl] Error cancelling Firecrawl job ${jobId} after ${reason}`,
			error
		);
	}
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

export async function processWebCrawlJob(
	firecrawlService: FirecrawlJobClient,
	job: Job<WebCrawlJobData>,
	runtime: WebCrawlWorkerRuntime = DEFAULT_WEB_CRAWL_RUNTIME
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

	let lastJobProgress = -1;
	const updateJobProgress = async (progress: number): Promise<void> => {
		if (progress === lastJobProgress) {
			return;
		}

		lastJobProgress = progress;
		await job.updateProgress(progress);
	};

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
	await updateJobProgress(5);

	// 4. Start crawl using v2 API
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

	console.log(
		`[worker:web-crawl] Starting crawl: ${url} | job=${crawlResult.jobId} | limit=${crawlLimit} depth=${maxDepth}`
	);

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

	await updateJobProgress(10);

	// 6. Poll for completion with incremental page updates
	let pollAttempts = 0;
	let crawlStatus = await firecrawlService.getCrawlStatus(crawlResult.jobId);
	let lastCompletedCount = 0;
	let lastPersistedDiscoveredPagesCount = linkSource.discoveredPagesCount ?? 0;
	let crawlStatusIncludesAllPages = false;
	let consecutiveReadyToFinalizePolls = hasReachedReportedCompletion(
		crawlStatus
	)
		? 1
		: 0;
	const crawlStartedAt = runtime.now();
	let lastProgressChangeAt = crawlStartedAt;
	// Track which pages we've already emitted events for (by URL)
	const emittedPageUrls = new Set<string>();
	let lastProgressSnapshot = getProgressSnapshot(crawlStatus, 0);

	const applyIncrementalStatusUpdate = async (
		currentStatus: CrawlStatus
	): Promise<void> => {
		const progress = currentStatus.progress;

		if (progress && progress.total > 0) {
			const progressPercent =
				10 + Math.floor((progress.completed / progress.total) * 70);
			await updateJobProgress(Math.min(progressPercent, 80));

			if (progress.total !== lastPersistedDiscoveredPagesCount) {
				await updateLinkSource(db, {
					id: linkSourceId,
					websiteId,
					discoveredPagesCount: progress.total,
				});
				lastPersistedDiscoveredPagesCount = progress.total;
			}
		}

		const newPages: NonNullable<CrawlStatus["pages"]> = [];
		if (currentStatus.pages && currentStatus.pages.length > 0) {
			for (const page of currentStatus.pages) {
				if (emittedPageUrls.has(page.url)) {
					continue;
				}

				emittedPageUrls.add(page.url);
				newPages.push(page);
			}

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

				const completedCountBeforeNewPages =
					emittedPageUrls.size - newPages.length;
				for (const [index, page] of newPages.entries()) {
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
						completedCount: completedCountBeforeNewPages + index + 1,
						totalCount: progress?.total ?? crawlLimit,
					});
				}
			}
		} else if (progress && progress.completed > lastCompletedCount) {
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
				completedCount: progress.completed,
				totalCount: progress.total,
			});
		}

		if (progress) {
			lastCompletedCount = progress.completed;
		}
	};

	await applyIncrementalStatusUpdate(crawlStatus);
	lastProgressSnapshot = getProgressSnapshot(crawlStatus, emittedPageUrls.size);

	while (
		isActiveCrawlStatus(crawlStatus.status) &&
		pollAttempts < runtime.maxPollAttempts
	) {
		await runtime.sleep(runtime.pollIntervalMs);
		pollAttempts++;

		if (pollAttempts % runtime.linkSourceCheckIntervalPolls === 0) {
			const currentLinkSource = await getLinkSourceById(db, {
				id: linkSourceId,
				websiteId,
			});

			if (!currentLinkSource) {
				console.log(
					`[worker:web-crawl] Aborting crawl ${crawlResult.jobId}: link source ${linkSourceId} deleted`
				);
				await cancelRemoteCrawl(
					firecrawlService,
					crawlResult.jobId,
					"link source deleted"
				);
				return;
			}

			if (
				currentLinkSource.status !== "pending" &&
				currentLinkSource.status !== "crawling"
			) {
				console.log(
					`[worker:web-crawl] Aborting crawl ${crawlResult.jobId}: link source ${linkSourceId} is ${currentLinkSource.status}`
				);
				await cancelRemoteCrawl(
					firecrawlService,
					crawlResult.jobId,
					`link source status changed to ${currentLinkSource.status}`
				);
				return;
			}
		}

		crawlStatus = await firecrawlService.getCrawlStatus(crawlResult.jobId);
		await applyIncrementalStatusUpdate(crawlStatus);

		const progressSnapshot = getProgressSnapshot(
			crawlStatus,
			emittedPageUrls.size
		);
		const now = runtime.now();
		if (progressSnapshot !== lastProgressSnapshot) {
			lastProgressSnapshot = progressSnapshot;
			lastProgressChangeAt = now;
		}

		if (hasReachedReportedCompletion(crawlStatus)) {
			consecutiveReadyToFinalizePolls++;
		} else {
			consecutiveReadyToFinalizePolls = 0;
		}

		let finalStatusForThisPoll: CrawlStatus | null = null;
		if (
			isActiveCrawlStatus(crawlStatus.status) &&
			consecutiveReadyToFinalizePolls >= 2
		) {
			finalStatusForThisPoll = await firecrawlService.getCrawlStatus(
				crawlResult.jobId,
				{
					includeAllPages: true,
				}
			);

			if (canTreatCrawlAsCompleted(finalStatusForThisPoll)) {
				crawlStatus = asCompletedCrawlStatus(finalStatusForThisPoll);
				crawlStatusIncludesAllPages = true;
				break;
			}
		}

		const idleMs = now - lastProgressChangeAt;
		if (
			isActiveCrawlStatus(crawlStatus.status) &&
			idleMs >= runtime.stallThresholdMs
		) {
			const stallStatus =
				finalStatusForThisPoll ??
				(await firecrawlService.getCrawlStatus(crawlResult.jobId, {
					includeAllPages: true,
				}));

			if (canTreatCrawlAsCompleted(stallStatus)) {
				crawlStatus = asCompletedCrawlStatus(stallStatus);
				crawlStatusIncludesAllPages = true;
				break;
			}

			const stallThresholdSeconds = Math.round(runtime.stallThresholdMs / 1000);
			const stallMessage = `Crawl stalled with no progress for ${stallThresholdSeconds}s`;
			console.error(
				`[worker:web-crawl] Stalled ${url} | job=${crawlResult.jobId} status=${crawlStatus.status} raw=${crawlStatus.rawStatus ?? "unknown"} progress=${crawlStatus.progress?.completed ?? 0}/${crawlStatus.progress?.total ?? 0} pages=${emittedPageUrls.size} idle=${Math.round(idleMs / 1000)}s`
			);
			await cancelRemoteCrawl(
				firecrawlService,
				crawlResult.jobId,
				`stall threshold reached for ${url}`
			);
			await updateLinkSource(db, {
				id: linkSourceId,
				websiteId,
				status: "failed",
				errorMessage: stallMessage,
			});
			await emitCrawlFailed({
				websiteId,
				organizationId,
				linkSourceId,
				url,
				error: stallMessage,
			});
			throw new Error(stallMessage);
		}

		if (pollAttempts % runtime.progressLogIntervalPolls === 0) {
			const elapsedMs = now - crawlStartedAt;
			console.log(
				`[worker:web-crawl] Crawling ${url} | job=${crawlResult.jobId} status=${crawlStatus.status} raw=${crawlStatus.rawStatus ?? "unknown"} progress=${crawlStatus.progress?.completed ?? 0}/${crawlStatus.progress?.total ?? 0} pages=${emittedPageUrls.size} poll=${pollAttempts} elapsed=${Math.round(elapsedMs / 1000)}s idle=${Math.round(idleMs / 1000)}s`
			);
		}
	}

	// Fetch all paginated results once the crawl is marked completed.
	// Firecrawl can paginate status data when payloads are large.
	if (crawlStatus.status === "completed" && !crawlStatusIncludesAllPages) {
		crawlStatus = await firecrawlService.getCrawlStatus(crawlResult.jobId, {
			includeAllPages: true,
		});
		crawlStatusIncludesAllPages = true;
	}

	// 7. Handle poll timeout
	if (isActiveCrawlStatus(crawlStatus.status)) {
		const timeoutMessage = "Crawl timed out after 30 minutes";
		console.error(
			`[worker:web-crawl] Timed out ${url} | job=${crawlResult.jobId} status=${crawlStatus.status} raw=${crawlStatus.rawStatus ?? "unknown"} progress=${crawlStatus.progress?.completed ?? 0}/${crawlStatus.progress?.total ?? 0} pages=${emittedPageUrls.size} polls=${pollAttempts}`
		);
		await cancelRemoteCrawl(
			firecrawlService,
			crawlResult.jobId,
			`timeout after ${runtime.maxPollAttempts} polls`
		);
		await updateLinkSource(db, {
			id: linkSourceId,
			websiteId,
			status: "failed",
			errorMessage: timeoutMessage,
		});
		await emitCrawlFailed({
			websiteId,
			organizationId,
			linkSourceId,
			url,
			error: timeoutMessage,
		});
		throw new Error(timeoutMessage);
	}

	// 8. Handle failure
	if (crawlStatus.status === "failed") {
		let errorMessage = crawlStatus.error ?? "Crawl failed";
		console.error(
			`[worker:web-crawl] Upstream failure ${url} | job=${crawlResult.jobId} status=${crawlStatus.status} raw=${crawlStatus.rawStatus ?? "unknown"} progress=${crawlStatus.progress?.completed ?? 0}/${crawlStatus.progress?.total ?? 0} pages=${emittedPageUrls.size}`
		);

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

	await updateJobProgress(85);

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

		await updateJobProgress(95);

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

	await updateJobProgress(100);
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
