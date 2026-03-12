import { beforeEach, describe, expect, it, mock } from "bun:test";

const showProgressToastMock = mock((_options: unknown) => "training-toast");
const toastDismissMock = mock((_id?: unknown) => "dismissed");
const toastErrorMock = mock(
	(_message: unknown, _data?: unknown) => "training-toast"
);
const toastSuccessMock = mock(
	(_message: unknown, _data?: unknown) => "training-toast"
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

const trainingProgressModulePromise = import("./training-progress");

function createContext() {
	const invalidateQueriesMock = mock((async (_args: unknown) => {}) as (
		args: unknown
	) => Promise<void>);
	const setQueriesDataMock = mock(((
		_filters: unknown,
		_updater: unknown
	) => {}) as (filters: unknown, updater: unknown) => void);

	return {
		invalidateQueriesMock,
		setQueriesDataMock,
		context: {
			queryClient: {
				invalidateQueries: invalidateQueriesMock,
				setQueriesData: setQueriesDataMock,
			},
			website: {
				id: "site-1",
				slug: "acme",
			},
		} as never,
	};
}

describe("training progress toasts", () => {
	beforeEach(() => {
		showProgressToastMock.mockClear();
		toastDismissMock.mockClear();
		toastErrorMock.mockClear();
		toastSuccessMock.mockClear();
	});

	it("reuses a stable toast id through progress and completion", async () => {
		const {
			handleTrainingCompleted,
			handleTrainingProgress,
			handleTrainingStarted,
		} = await trainingProgressModulePromise;
		const { context } = createContext();

		handleTrainingStarted({
			event: {
				type: "trainingStarted",
				payload: {
					aiAgentId: "agent-1",
					organizationId: "org-1",
					totalItems: 0,
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(toastDismissMock).toHaveBeenCalledWith("training-agent-1-result");

		handleTrainingProgress({
			event: {
				type: "trainingProgress",
				payload: {
					aiAgentId: "agent-1",
					currentItem: {
						id: "knowledge-1",
						title: "Getting Started",
						type: "url",
					},
					organizationId: "org-1",
					percentage: 25,
					processedItems: 3,
					totalItems: 12,
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(showProgressToastMock.mock.calls[0]?.[0]).toEqual({
			id: "training-agent-1-progress",
			indeterminate: true,
			status: "Processing knowledge base",
			title: "Training AI agent...",
		});
		expect(showProgressToastMock.mock.calls[1]?.[0]).toEqual({
			id: "training-agent-1-progress",
			status: "3 of 12 items processed",
			title: "Training AI agent...",
			value: 25,
			valueLabel: "25%",
		});

		toastDismissMock.mockClear();

		handleTrainingCompleted({
			event: {
				type: "trainingCompleted",
				payload: {
					aiAgentId: "agent-1",
					duration: 65_000,
					organizationId: "org-1",
					totalChunks: 42,
					totalItems: 12,
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(showProgressToastMock).toHaveBeenCalledTimes(2);
		expect(toastDismissMock.mock.calls).toEqual([
			["training-agent-1-progress"],
			["training-agent-1-result"],
		]);
		expect(toastSuccessMock).toHaveBeenCalledTimes(1);
		expect(toastSuccessMock.mock.calls[0]?.[0]).toBe("Training complete!");
		expect(toastSuccessMock.mock.calls[0]?.[1]).toMatchObject({
			description: "12 items processed, 42 chunks created in 1m 5s",
			id: "training-agent-1-result",
		});
	});

	it("switches the same toast id to error when training fails", async () => {
		const { handleTrainingFailed } = await trainingProgressModulePromise;
		const { context } = createContext();

		handleTrainingFailed({
			event: {
				type: "trainingFailed",
				payload: {
					aiAgentId: "agent-1",
					error: "Embedding request failed",
					organizationId: "org-1",
					userId: "user-1",
					visitorId: null,
					websiteId: "site-1",
				},
			} as never,
			context,
		});

		expect(toastDismissMock.mock.calls).toEqual([
			["training-agent-1-progress"],
			["training-agent-1-result"],
		]);
		expect(toastErrorMock).toHaveBeenCalledTimes(1);
		expect(toastErrorMock.mock.calls[0]?.[0]).toBe("Training failed");
		expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({
			description: "Embedding request failed",
			id: "training-agent-1-result",
		});
	});
});
