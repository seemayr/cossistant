import { beforeEach, describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const useQueryMock = mock((options: unknown) => options);
const queryTinybirdPipeMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);
const fetchQueryMock = mock(
	(async (_args: unknown) => null) as (args: unknown) => Promise<unknown>
);
const useTinybirdTokenMock = mock(((
	_websiteSlug: string,
	_options?: unknown
) => ({
	data: null,
})) as (
	websiteSlug: string,
	options?: unknown
) => {
	data: {
		enabled?: boolean;
		token: string | null;
		host: string | null;
		expiresAt?: number | null;
		maxRetentionDays: number | null;
	} | null;
});

mock.module("@tanstack/react-query", () => ({
	useQuery: useQueryMock,
	useQueryClient: () => ({
		fetchQuery: fetchQueryMock,
	}),
}));

mock.module("@/lib/tinybird", () => ({
	queryTinybirdPipe: queryTinybirdPipeMock,
	useTinybirdToken: useTinybirdTokenMock,
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		website: {
			getSatisfactionSignals: {
				queryOptions: (input: unknown) => ({
					queryKey: ["website.getSatisfactionSignals", input],
				}),
			},
		},
	}),
}));

const modulePromise = import("./use-inbox-analytics");

function getTinybirdCall(index: number) {
	const call = queryTinybirdPipeMock.mock.calls[index] as
		| [
				string,
				{
					date_from: string;
					date_to: string;
					prev_date_from: string;
					prev_date_to: string;
				},
				string,
				string,
		  ]
		| undefined;

	if (!call) {
		throw new Error(`Tinybird call ${index} not found`);
	}

	return call;
}

async function renderHook<TValue>(renderValue: () => TValue): Promise<TValue> {
	let hookValue: TValue | null = null;

	function Harness() {
		hookValue = renderValue();
		return null;
	}

	renderToStaticMarkup(<Harness />);

	if (hookValue === null) {
		throw new Error("Hook did not render");
	}

	return hookValue;
}

describe("useInboxAnalytics", () => {
	beforeEach(() => {
		useQueryMock.mockClear();
		queryTinybirdPipeMock.mockClear();
		fetchQueryMock.mockClear();
		useTinybirdTokenMock.mockClear();
	});

	it("aligns Tinybird token caching with the analytics stale time", async () => {
		const { useInboxAnalytics } = await modulePromise;

		await renderHook(() =>
			useInboxAnalytics({
				websiteSlug: "acme",
				rangeDays: 7,
			})
		);

		expect(useTinybirdTokenMock).toHaveBeenCalledTimes(1);
		expect(useTinybirdTokenMock.mock.calls[0]).toEqual([
			"acme",
			{ staleTimeMs: 300_000 },
		]);

		const options = useQueryMock.mock.calls[0]?.[0] as {
			enabled: boolean;
			queryKey: unknown[];
			staleTime: number;
			refetchInterval: number;
		};

		expect(options).toMatchObject({
			enabled: false,
			staleTime: 300_000,
			refetchInterval: 300_000,
		});
		expect(options.queryKey).toEqual(["inbox-analytics", "acme", 7, undefined]);
	});

	it("stays inert when Tinybird is disabled by the server token response", async () => {
		const { useInboxAnalytics } = await modulePromise;

		useTinybirdTokenMock.mockReturnValue({
			data: {
				enabled: false,
				token: null,
				host: null,
				expiresAt: null,
				maxRetentionDays: null,
			},
		});

		await renderHook(() =>
			useInboxAnalytics({
				websiteSlug: "acme",
				rangeDays: 7,
			})
		);

		const options = useQueryMock.mock.calls[0]?.[0] as {
			enabled: boolean;
			queryKey: unknown[];
		};

		expect(options.enabled).toBe(false);
		expect(options.queryKey).toEqual(["inbox-analytics", "acme", 7, null]);
	});

	it("uses range-specific query keys for historical analytics", async () => {
		const { useInboxAnalytics } = await modulePromise;

		useTinybirdTokenMock.mockReturnValue({
			data: {
				token: "tb-token",
				host: "https://tinybird.example",
				maxRetentionDays: 90,
			},
		});

		await renderHook(() =>
			useInboxAnalytics({
				websiteSlug: "acme",
				rangeDays: 7,
			})
		);

		await renderHook(() =>
			useInboxAnalytics({
				websiteSlug: "acme",
				rangeDays: 30,
			})
		);

		const firstOptions = useQueryMock.mock.calls[0]?.[0] as {
			queryKey: unknown[];
		};
		const secondOptions = useQueryMock.mock.calls[1]?.[0] as {
			queryKey: unknown[];
		};

		expect(firstOptions.queryKey).toEqual([
			"inbox-analytics",
			"acme",
			7,
			"tb-token",
		]);
		expect(secondOptions.queryKey).toEqual([
			"inbox-analytics",
			"acme",
			30,
			"tb-token",
		]);
	});

	it("changes Tinybird date windows when the selected range changes", async () => {
		const { useInboxAnalytics } = await modulePromise;

		useTinybirdTokenMock.mockReturnValue({
			data: {
				token: "tb-token",
				host: "https://tinybird.example",
				maxRetentionDays: 90,
			},
		});
		queryTinybirdPipeMock.mockImplementation(async (pipe: unknown) => {
			if (pipe === "unique_visitors") {
				return [
					{ period: "current", unique_visitors: 0 },
					{ period: "previous", unique_visitors: 0 },
				];
			}
			return [];
		});

		await renderHook(() =>
			useInboxAnalytics({
				websiteSlug: "acme",
				rangeDays: 7,
			})
		);

		const sevenDayOptions = useQueryMock.mock.calls[0]?.[0] as {
			queryFn: () => Promise<unknown>;
		};
		await sevenDayOptions.queryFn();

		const analyticsSevenDayCall = getTinybirdCall(0);
		const uniqueVisitorsSevenDayCall = getTinybirdCall(1);

		queryTinybirdPipeMock.mockClear();
		fetchQueryMock.mockClear();
		useQueryMock.mockClear();

		await renderHook(() =>
			useInboxAnalytics({
				websiteSlug: "acme",
				rangeDays: 30,
			})
		);

		const thirtyDayOptions = useQueryMock.mock.calls[0]?.[0] as {
			queryFn: () => Promise<unknown>;
		};
		await thirtyDayOptions.queryFn();

		const analyticsThirtyDayCall = getTinybirdCall(0);
		const uniqueVisitorsThirtyDayCall = getTinybirdCall(1);

		const dayMs = 24 * 60 * 60 * 1000;
		const sevenDayRangeMs =
			Date.parse(analyticsSevenDayCall[1].date_to) -
			Date.parse(analyticsSevenDayCall[1].date_from);
		const thirtyDayRangeMs =
			Date.parse(analyticsThirtyDayCall[1].date_to) -
			Date.parse(analyticsThirtyDayCall[1].date_from);

		expect(analyticsSevenDayCall[0]).toBe("inbox_analytics");
		expect(uniqueVisitorsSevenDayCall[0]).toBe("unique_visitors");
		expect(analyticsSevenDayCall[1]).toEqual(uniqueVisitorsSevenDayCall[1]);
		expect(analyticsThirtyDayCall[0]).toBe("inbox_analytics");
		expect(uniqueVisitorsThirtyDayCall[0]).toBe("unique_visitors");
		expect(analyticsThirtyDayCall[1]).toEqual(uniqueVisitorsThirtyDayCall[1]);
		expect(Math.abs(sevenDayRangeMs - 7 * dayMs)).toBeLessThan(60_000);
		expect(Math.abs(thirtyDayRangeMs - 30 * dayMs)).toBeLessThan(60_000);
		expect(Date.parse(analyticsThirtyDayCall[1].date_from)).toBeLessThan(
			Date.parse(analyticsSevenDayCall[1].date_from)
		);
		expect(Date.parse(analyticsThirtyDayCall[1].prev_date_from)).toBeLessThan(
			Date.parse(analyticsSevenDayCall[1].prev_date_from)
		);
	});

	it("maps unique visitors from the dedicated Tinybird pipe", async () => {
		const { useInboxAnalytics } = await modulePromise;

		useTinybirdTokenMock.mockReturnValue({
			data: {
				token: "tb-token",
				host: "https://tinybird.example",
				maxRetentionDays: 90,
			},
		});
		queryTinybirdPipeMock.mockImplementation(async (pipe: unknown) => {
			if (pipe === "inbox_analytics") {
				return [
					{
						event_type: "conversation_started",
						median_duration: null,
						event_count: 10,
						period: "current",
					},
					{
						event_type: "conversation_started",
						median_duration: null,
						event_count: 8,
						period: "previous",
					},
				];
			}

			return [
				{ period: "current", unique_visitors: 75 },
				{ period: "previous", unique_visitors: 50 },
			];
		});

		await renderHook(() =>
			useInboxAnalytics({
				websiteSlug: "acme",
				rangeDays: 14,
			})
		);

		const options = useQueryMock.mock.calls[0]?.[0] as {
			queryFn: () => Promise<{
				current: { uniqueVisitors: number };
				previous: { uniqueVisitors: number };
			}>;
		};
		const result = await options.queryFn();

		expect(queryTinybirdPipeMock.mock.calls.map((call) => call[0])).toEqual([
			"inbox_analytics",
			"unique_visitors",
		]);
		expect(result.current.uniqueVisitors).toBe(75);
		expect(result.previous.uniqueVisitors).toBe(50);
	});
});
