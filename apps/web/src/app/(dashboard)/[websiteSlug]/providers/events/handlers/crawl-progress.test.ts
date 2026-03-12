import { beforeEach, describe, expect, it, mock } from "bun:test";

const showProgressToastMock = mock((_options: unknown) => "crawl-toast");
const toastDismissMock = mock((_id?: unknown) => "dismissed");
const toastErrorMock = mock(
	(_message: unknown, _data?: unknown) => "crawl-toast"
);
const toastSuccessMock = mock(
	(_message: unknown, _data?: unknown) => "crawl-toast"
);

mock.module("@/components/ui/sonner", () => ({
	showProgressToast: showProgressToastMock,
}));

mock.module("sonner", () => ({
	toast: {
		dismiss: toastDismissMock,
		error: toastErrorMock,
		success: toastSuccessMock,
	},
}));

const crawlProgressModulePromise = import("./crawl-progress");
type ToastAction = {
	label: string;
	onClick?: () => void;
};

function createContext({
	canAutoStartTraining = false,
	canRequestTraining = true,
	startTrainingResult = false,
} = {}) {
	const invalidateQueriesMock = mock((async (_args: unknown) => {}) as (
		args: unknown
	) => Promise<void>);
	const setQueriesDataMock = mock(((
		_filters: unknown,
		_updater: unknown
	) => {}) as (filters: unknown, updater: unknown) => void);
	const requestTrainingMock = mock(
		(async () => true) as () => Promise<boolean>
	);
	const startTrainingIfAllowedMock = mock(
		(async () => startTrainingResult) as () => Promise<boolean>
	);

	return {
		invalidateQueriesMock,
		requestTrainingMock,
		setQueriesDataMock,
		startTrainingIfAllowedMock,
		context: {
			queryClient: {
				invalidateQueries: invalidateQueriesMock,
				setQueriesData: setQueriesDataMock,
			},
			training: {
				canAutoStartTraining,
				canRequestTraining,
				isTrainingActive: false,
				requestTraining: requestTrainingMock,
				startTrainingIfAllowed: startTrainingIfAllowedMock,
			},
			website: {
				id: "site-1",
				slug: "acme",
			},
		} as never,
	};
}

describe("crawl progress toasts", () => {
	beforeEach(() => {
		showProgressToastMock.mockClear();
		toastDismissMock.mockClear();
		toastErrorMock.mockClear();
		toastSuccessMock.mockClear();
	});

	it("dismisses the progress toast and shows a manual train CTA when auto-start is unavailable", async () => {
		const { handleCrawlCompleted, handleCrawlProgress, handleCrawlStarted } =
			await crawlProgressModulePromise;
		const { context, requestTrainingMock, startTrainingIfAllowedMock } =
			createContext();

		handleCrawlStarted({
			event: {
				type: "crawlStarted",
				payload: {
					discoveredPages: [],
					linkSourceId: "link-1",
					organizationId: "org-1",
					totalPagesCount: 10,
					url: "https://docs.example.com/start",
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(toastDismissMock).toHaveBeenCalledWith("crawl-link-1-result");

		handleCrawlProgress({
			event: {
				type: "crawlProgress",
				payload: {
					completedCount: 4,
					linkSourceId: "link-1",
					organizationId: "org-1",
					page: {
						status: "completed",
						title: "Getting Started",
						url: "https://docs.example.com/start",
					},
					totalCount: 10,
					url: "https://docs.example.com/start",
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(showProgressToastMock.mock.calls[0]?.[0]).toEqual({
			id: "crawl-link-1-progress",
			indeterminate: true,
			status: "Discovering pages",
			title: "Crawling docs.example.com...",
		});
		expect(showProgressToastMock.mock.calls[1]?.[0]).toEqual({
			id: "crawl-link-1-progress",
			status: "4 of 10 pages crawled",
			title: "Crawling docs.example.com...",
			value: 40,
			valueLabel: "4/10",
		});

		toastDismissMock.mockClear();

		await handleCrawlCompleted({
			event: {
				type: "crawlCompleted",
				payload: {
					crawledPagesCount: 10,
					failedPagesCount: 0,
					linkSourceId: "link-1",
					organizationId: "org-1",
					totalSizeBytes: 2048,
					url: "https://docs.example.com/start",
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(showProgressToastMock).toHaveBeenCalledTimes(2);
		expect(toastDismissMock.mock.calls).toEqual([
			["crawl-link-1-progress"],
			["crawl-link-1-result"],
		]);
		expect(startTrainingIfAllowedMock).toHaveBeenCalledTimes(0);
		expect(toastSuccessMock).toHaveBeenCalledTimes(1);
		expect(toastSuccessMock.mock.calls[0]?.[0]).toBe(
			"10 pages added to knowledge base"
		);
		expect(toastSuccessMock.mock.calls[0]?.[1]).toMatchObject({
			id: "crawl-link-1-result",
		});
		const action = (
			toastSuccessMock.mock.calls[0]?.[1] as
				| { action?: ToastAction }
				| undefined
		)?.action;
		expect(action?.label).toBe("Train Agent");
		action?.onClick?.();
		expect(requestTrainingMock).toHaveBeenCalledTimes(1);
	});

	it("auto-starts training without showing the manual CTA toast when allowed", async () => {
		const { handleCrawlCompleted } = await crawlProgressModulePromise;
		const { context, startTrainingIfAllowedMock } = createContext({
			canAutoStartTraining: true,
			startTrainingResult: true,
		});

		await handleCrawlCompleted({
			event: {
				type: "crawlCompleted",
				payload: {
					crawledPagesCount: 10,
					failedPagesCount: 0,
					linkSourceId: "link-1",
					organizationId: "org-1",
					totalSizeBytes: 2048,
					url: "https://docs.example.com/start",
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(startTrainingIfAllowedMock).toHaveBeenCalledTimes(1);
		expect(toastSuccessMock).toHaveBeenCalledTimes(0);
		expect(toastDismissMock.mock.calls).toEqual([
			["crawl-link-1-progress"],
			["crawl-link-1-result"],
		]);
	});

	it("dismisses the progress toast before showing crawl errors", async () => {
		const { handleCrawlFailed } = await crawlProgressModulePromise;
		const { context } = createContext();

		handleCrawlFailed({
			event: {
				type: "crawlFailed",
				payload: {
					error: "Network timeout",
					linkSourceId: "link-1",
					organizationId: "org-1",
					url: "https://docs.example.com/start",
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(toastDismissMock.mock.calls).toEqual([
			["crawl-link-1-progress"],
			["crawl-link-1-result"],
		]);
		expect(toastErrorMock).toHaveBeenCalledTimes(1);
		expect(toastErrorMock.mock.calls[0]?.[0]).toBe(
			"Crawl failed for docs.example.com"
		);
		expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({
			description: "Network timeout",
			id: "crawl-link-1-result",
		});
	});
});
