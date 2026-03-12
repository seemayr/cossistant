import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { WebCrawlJobData } from "@cossistant/jobs";

type MockCrawlStatus = {
	status: "pending" | "crawling" | "completed" | "failed";
	rawStatus?: string | null;
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

type MockCrawlPage = NonNullable<MockCrawlStatus["pages"]>[number];

type MockLinkSource = {
	id: string;
	websiteId: string;
	status: "pending" | "mapping" | "crawling" | "completed" | "failed";
	includePaths: string[] | null;
	excludePaths: string[] | null;
	ignoredUrls: string[] | null;
	discoveredPagesCount: number;
	crawledPagesCount: number;
	totalSizeBytes: number;
	firecrawlJobId?: string | null;
	deletedAt?: string | null;
	errorMessage?: string | null;
};

type StatusRequest = {
	jobId: string;
	options?: { includeAllPages?: boolean };
};

const updateLinkSourceEvents: Record<string, unknown>[] = [];
const realtimeEvents: {
	event: string;
	payload: Record<string, unknown>;
}[] = [];
const statusRequests: StatusRequest[] = [];
const progressCalls: number[] = [];
const operationLog: string[] = [];

let linkSourceState: MockLinkSource | null = null;
let crawlStatusSequence: MockCrawlStatus[] = [];
let crawlStatusFallback: MockCrawlStatus | null = null;
let knowledgeIdCounter = 0;

const getLinkSourceByIdMock = mock(async () => {
	if (!linkSourceState) {
		return null;
	}

	return { ...linkSourceState };
});

const updateLinkSourceMock = mock(
	async (
		_db: unknown,
		params: Record<string, unknown>
	): Promise<MockLinkSource | null> => {
		updateLinkSourceEvents.push(params);
		if (params.status === "failed") {
			operationLog.push("update:failed");
		}

		if (!linkSourceState) {
			return null;
		}

		linkSourceState = {
			...linkSourceState,
			...params,
		} as MockLinkSource;

		return { ...linkSourceState };
	}
);

const getLinkSourceTotalSizeMock = mock(async () => 0);
const upsertKnowledgeMock = mock(async () => {
	knowledgeIdCounter += 1;
	return { id: `knowledge-${knowledgeIdCounter}` };
});
const getWebsiteByIdMock = mock(async () => ({
	id: "site-1",
	organizationId: "org-1",
}));
const getPlanForWebsiteMock = mock(async () => ({
	features: {
		"ai-agent-training-mb": null,
	},
}));
const emitToWebsiteMock = mock(
	async (
		_websiteId: string,
		event: string,
		payload: Record<string, unknown>
	) => {
		realtimeEvents.push({ event, payload });
	}
);

const isConfiguredMock = mock(() => true);
const startCrawlMock = mock(async () => {
	operationLog.push("startCrawl");
	return {
		success: true,
		jobId: "fc-job-1",
	};
});
const getCrawlStatusMock = mock(
	async (jobId: string, options?: { includeAllPages?: boolean }) => {
		statusRequests.push({ jobId, options });

		if (crawlStatusSequence.length > 0) {
			const nextStatus = crawlStatusSequence.shift();
			if (nextStatus) {
				return nextStatus;
			}
		}

		if (!crawlStatusFallback) {
			throw new Error("No crawl status configured for test");
		}

		return crawlStatusFallback;
	}
);
const cancelCrawlMock = mock(async () => {
	operationLog.push("cancelCrawl");
	return { success: true };
});
const getCrawlErrorsMock = mock(async () => ({
	success: true,
	errors: [],
}));

class MockFirecrawlService {
	isConfigured = isConfiguredMock;
	startCrawl = startCrawlMock;
	getCrawlStatus = getCrawlStatusMock;
	cancelCrawl = cancelCrawlMock;
	getCrawlErrors = getCrawlErrorsMock;
}

class MockWorker<T> {
	on(_event: string, _handler: (...args: unknown[]) => void) {}
	waitUntilReady = mock(async () => {});
	close = mock(async () => {});
}

class MockQueue<T> {
	waitUntilReady = mock(async () => {});
	close = mock(async () => {});
}

class MockQueueEvents {
	on(_event: string, _handler: (...args: unknown[]) => void) {}
	waitUntilReady = mock(async () => {});
	close = mock(async () => {});
}

const dbWhereMock = mock(async () => {});
const dbSetMock = mock(() => ({
	where: dbWhereMock,
}));
const dbUpdateMock = mock(() => ({
	set: dbSetMock,
}));

mock.module("@api/db/queries/knowledge", () => ({
	upsertKnowledge: upsertKnowledgeMock,
}));

mock.module("@api/db/queries/link-source", () => ({
	getLinkSourceById: getLinkSourceByIdMock,
	getLinkSourceTotalSize: getLinkSourceTotalSizeMock,
	updateLinkSource: updateLinkSourceMock,
}));

mock.module("@api/db/queries/website", () => ({
	getWebsiteById: getWebsiteByIdMock,
}));

mock.module("@api/db/schema/knowledge", () => ({
	knowledge: {
		linkSourceId: "link_source_id",
		deletedAt: "deleted_at",
	},
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/services/firecrawl", () => ({
	FirecrawlService: MockFirecrawlService,
}));

mock.module("@cossistant/jobs", () => ({
	QUEUE_NAMES: {
		WEB_CRAWL: "web-crawl",
	},
}));

mock.module("@cossistant/redis", () => ({
	getSafeRedisUrl: () => "redis://masked",
}));

mock.module("@workers/db", () => ({
	db: {
		update: dbUpdateMock,
	},
}));

mock.module("@workers/env", () => ({
	env: {
		FIRECRAWL_API_KEY: "test-firecrawl-key",
	},
}));

mock.module("@workers/realtime", () => ({
	emitToWebsite: emitToWebsiteMock,
}));

mock.module("bullmq", () => ({
	Worker: MockWorker,
	Queue: MockQueue,
	QueueEvents: MockQueueEvents,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({
		type: "and",
		conditions,
	}),
	eq: (left: unknown, right: unknown) => ({
		type: "eq",
		left,
		right,
	}),
	isNull: (value: unknown) => ({
		type: "isNull",
		value,
	}),
}));

const modulePromise = import("./worker");

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function buildLinkSource(
	overrides: Partial<MockLinkSource> = {}
): MockLinkSource {
	return {
		id: "link-source-1",
		websiteId: "site-1",
		status: "pending",
		includePaths: null,
		excludePaths: null,
		ignoredUrls: null,
		discoveredPagesCount: 0,
		crawledPagesCount: 0,
		totalSizeBytes: 0,
		firecrawlJobId: null,
		deletedAt: null,
		errorMessage: null,
		...overrides,
	};
}

function buildJobData(
	overrides: Partial<WebCrawlJobData> = {}
): WebCrawlJobData {
	return {
		linkSourceId: "link-source-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		url: "https://example.com",
		crawlLimit: 1000,
		createdBy: "user-1",
		includePaths: null,
		excludePaths: null,
		maxDepth: 1,
		...overrides,
	};
}

function buildPage(path: string, title = path): MockCrawlPage {
	return {
		url: `https://example.com${path}`,
		title,
		markdown: `# ${title}\n\ncontent`,
		sizeBytes: 128,
	};
}

function setCrawlStatuses(statuses: MockCrawlStatus[]): void {
	crawlStatusSequence = statuses.map((status) => ({
		...status,
		progress: status.progress ? { ...status.progress } : undefined,
		pages: status.pages ? [...status.pages] : undefined,
	}));
	crawlStatusFallback =
		crawlStatusSequence[crawlStatusSequence.length - 1] ?? null;
}

function createRuntime(overrides: Partial<Record<string, number>> = {}) {
	let nowMs = 0;

	return {
		runtime: {
			now: () => nowMs,
			sleep: async (ms: number) => {
				nowMs += ms;
			},
			pollIntervalMs: overrides.pollIntervalMs ?? 5000,
			maxPollAttempts: overrides.maxPollAttempts ?? 360,
			stallThresholdMs: overrides.stallThresholdMs ?? 60_000,
			linkSourceCheckIntervalPolls: overrides.linkSourceCheckIntervalPolls ?? 3,
			progressLogIntervalPolls: overrides.progressLogIntervalPolls ?? 10,
		},
		getNowMs: () => nowMs,
	};
}

function createJob(data: WebCrawlJobData = buildJobData()) {
	progressCalls.length = 0;

	return {
		data,
		updateProgress: mock(async (value: number) => {
			progressCalls.push(value);
		}),
	};
}

beforeEach(() => {
	updateLinkSourceEvents.length = 0;
	realtimeEvents.length = 0;
	statusRequests.length = 0;
	progressCalls.length = 0;
	operationLog.length = 0;
	knowledgeIdCounter = 0;
	linkSourceState = buildLinkSource();
	crawlStatusSequence = [];
	crawlStatusFallback = null;

	getLinkSourceByIdMock.mockReset();
	getLinkSourceByIdMock.mockImplementation(async () => {
		if (!linkSourceState) {
			return null;
		}

		return { ...linkSourceState };
	});

	updateLinkSourceMock.mockReset();
	updateLinkSourceMock.mockImplementation(
		async (_db: unknown, params: Record<string, unknown>) => {
			updateLinkSourceEvents.push(params);
			if (params.status === "failed") {
				operationLog.push("update:failed");
			}

			if (!linkSourceState) {
				return null;
			}

			linkSourceState = {
				...linkSourceState,
				...params,
			} as MockLinkSource;

			return { ...linkSourceState };
		}
	);

	getLinkSourceTotalSizeMock.mockReset();
	getLinkSourceTotalSizeMock.mockResolvedValue(0);
	upsertKnowledgeMock.mockReset();
	upsertKnowledgeMock.mockImplementation(async () => {
		knowledgeIdCounter += 1;
		return { id: `knowledge-${knowledgeIdCounter}` };
	});
	getWebsiteByIdMock.mockReset();
	getWebsiteByIdMock.mockResolvedValue({
		id: "site-1",
		organizationId: "org-1",
	});
	getPlanForWebsiteMock.mockReset();
	getPlanForWebsiteMock.mockResolvedValue({
		features: {
			"ai-agent-training-mb": null,
		},
	});
	emitToWebsiteMock.mockReset();
	emitToWebsiteMock.mockImplementation(
		async (
			_websiteId: string,
			event: string,
			payload: Record<string, unknown>
		) => {
			realtimeEvents.push({ event, payload });
		}
	);

	isConfiguredMock.mockReset();
	isConfiguredMock.mockReturnValue(true);
	startCrawlMock.mockReset();
	startCrawlMock.mockImplementation(async () => {
		operationLog.push("startCrawl");
		return {
			success: true,
			jobId: "fc-job-1",
		};
	});
	getCrawlStatusMock.mockReset();
	getCrawlStatusMock.mockImplementation(
		async (jobId: string, options?: { includeAllPages?: boolean }) => {
			statusRequests.push({ jobId, options });

			if (crawlStatusSequence.length > 0) {
				const nextStatus = crawlStatusSequence.shift();
				if (nextStatus) {
					return nextStatus;
				}
			}

			if (!crawlStatusFallback) {
				throw new Error("No crawl status configured for test");
			}

			return crawlStatusFallback;
		}
	);
	cancelCrawlMock.mockReset();
	cancelCrawlMock.mockImplementation(async () => {
		operationLog.push("cancelCrawl");
		return { success: true };
	});
	getCrawlErrorsMock.mockReset();
	getCrawlErrorsMock.mockResolvedValue({
		success: true,
		errors: [],
	});

	dbWhereMock.mockReset();
	dbWhereMock.mockResolvedValue(undefined);
	dbSetMock.mockReset();
	dbSetMock.mockReturnValue({
		where: dbWhereMock,
	});
	dbUpdateMock.mockReset();
	dbUpdateMock.mockReturnValue({
		set: dbSetMock,
	});

	console.log = mock(() => {}) as typeof console.log;
	console.warn = mock(() => {}) as typeof console.warn;
	console.error = mock(() => {}) as typeof console.error;
});

afterEach(() => {
	console.log = originalConsoleLog;
	console.warn = originalConsoleWarn;
	console.error = originalConsoleError;
});

describe("web crawl worker", () => {
	it("keeps polling when Firecrawl starts in pending instead of completing empty", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const page = buildPage("/docs");

		setCrawlStatuses([
			{
				status: "pending",
				rawStatus: "queued",
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 1,
					total: 1,
				},
				pages: [page],
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 1,
					total: 1,
				},
				pages: [page],
			},
		]);

		await processWebCrawlJob(
			firecrawlService,
			job as never,
			createRuntime().runtime
		);

		expect(statusRequests).toHaveLength(3);
		expect(statusRequests[0]?.options).toBeUndefined();
		expect(statusRequests[2]?.options).toEqual({ includeAllPages: true });
		expect(upsertKnowledgeMock).toHaveBeenCalledTimes(1);

		const completedEvent = realtimeEvents.find(
			(entry) => entry.event === "crawlCompleted"
		);
		expect(completedEvent?.payload.crawledPagesCount).toBe(1);
	});

	it("fails stalled crawls after 60 seconds and cancels the remote job", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const pages = Array.from({ length: 48 }, (_, index) =>
			buildPage(`/page-${index + 1}`, `Page ${index + 1}`)
		);

		setCrawlStatuses(
			Array.from({ length: 14 }, () => ({
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 48,
					total: 100,
				},
				pages,
			}))
		);

		await expect(
			processWebCrawlJob(
				firecrawlService,
				job as never,
				createRuntime().runtime
			)
		).rejects.toThrow("Crawl stalled with no progress for 60s");

		expect(cancelCrawlMock).toHaveBeenCalledTimes(1);
		expect(getCrawlErrorsMock).toHaveBeenCalledTimes(0);

		const failedUpdates = updateLinkSourceEvents.filter(
			(entry) => entry.status === "failed"
		);
		expect(failedUpdates).toHaveLength(1);
		expect(failedUpdates[0]?.errorMessage).toBe(
			"Crawl stalled with no progress for 60s"
		);

		const failedEvents = realtimeEvents.filter(
			(entry) => entry.event === "crawlFailed"
		);
		expect(failedEvents).toHaveLength(1);
	});

	it("completes early when Firecrawl reports completed totals but never flips terminal", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const pageOne = buildPage("/docs");
		const pageTwo = buildPage("/blog");

		setCrawlStatuses([
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 2,
					total: 2,
				},
				pages: [pageOne],
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 2,
					total: 2,
				},
				pages: [pageOne],
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 2,
					total: 2,
				},
				pages: [pageOne, pageTwo],
			},
		]);

		await processWebCrawlJob(
			firecrawlService,
			job as never,
			createRuntime().runtime
		);

		expect(
			statusRequests.some(
				(request) => request.options?.includeAllPages === true
			)
		).toBe(true);
		expect(cancelCrawlMock).toHaveBeenCalledTimes(0);
		expect(upsertKnowledgeMock).toHaveBeenCalledTimes(2);

		const completedEvent = realtimeEvents.find(
			(entry) => entry.event === "crawlCompleted"
		);
		expect(completedEvent?.payload.crawledPagesCount).toBe(2);
	});

	it("cancels the remote crawl before marking the source failed on timeout", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();

		setCrawlStatuses([
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
		]);

		await expect(
			processWebCrawlJob(
				firecrawlService,
				job as never,
				createRuntime({
					maxPollAttempts: 2,
					stallThresholdMs: 120_000,
				}).runtime
			)
		).rejects.toThrow("Crawl timed out after 30 minutes");

		const cancelIndex = operationLog.indexOf("cancelCrawl");
		const failedIndex = operationLog.indexOf("update:failed");
		expect(cancelIndex).toBeGreaterThanOrEqual(0);
		expect(failedIndex).toBeGreaterThanOrEqual(0);
		expect(cancelIndex).toBeLessThan(failedIndex);
	});

	it("only performs poll-loop writes when values change", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const page = buildPage("/docs");

		setCrawlStatuses([
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 10,
					total: 10,
				},
				pages: [page],
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 10,
					total: 10,
				},
				pages: [page],
			},
		]);

		await processWebCrawlJob(
			firecrawlService,
			job as never,
			createRuntime().runtime
		);

		expect(progressCalls.filter((value) => value === 17)).toHaveLength(1);
		expect(
			updateLinkSourceEvents.filter(
				(entry) => entry.discoveredPagesCount === 10
			)
		).toHaveLength(1);
	});
});
