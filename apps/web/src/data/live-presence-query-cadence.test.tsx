import { beforeEach, describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const useQueryMock = mock((options: unknown) => options);
const fetchQueryMock = mock((async (_args: unknown) => ({
	profilesByVisitorId: {},
})) as (
	args: unknown
) => Promise<{ profilesByVisitorId: Record<string, unknown> }>);
const queryTinybirdPipeMock = mock((async (pipe: string) => {
	if (pipe === "visitor_presence") {
		return [
			{
				visitor_id: "visitor-1",
				status: "online",
				last_seen_at: "2026-03-26T10:00:00.000Z",
				city: "Paris",
				country_code: "FR",
				latitude: 48.8566,
				longitude: 2.3522,
				page_path: "/pricing",
				attribution_channel: "paid",
			},
		];
	}

	return [];
}) as (...args: unknown[]) => Promise<unknown>);
const useTinybirdTokenMock = mock(((
	_websiteSlug: string,
	_options?: unknown
) => ({
	data: {
		enabled: true,
		token: "tb-token",
		host: "https://api.tinybird.test",
		expiresAt: Date.now() + 600_000,
		maxRetentionDays: 90,
	},
})) as (
	websiteSlug: string,
	options?: unknown
) => {
	data: {
		enabled: boolean;
		token: string | null;
		host: string | null;
		expiresAt: number | null;
		maxRetentionDays: number | null;
	} | null;
});
const listPresenceProfilesQueryOptionsMock = mock((input: unknown) => ({
	queryKey: ["visitor.listPresenceProfiles", input],
}));

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
		visitor: {
			listPresenceProfiles: {
				queryOptions: listPresenceProfilesQueryOptionsMock,
			},
		},
	}),
}));

const useOnlineNowModulePromise = import("./use-online-now");
const usePresenceLocationsModulePromise = import("./use-presence-locations");
const useVisitorPresenceModulePromise = import("./use-visitor-presence");

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

describe("live presence query cadence", () => {
	beforeEach(() => {
		useQueryMock.mockClear();
		fetchQueryMock.mockClear();
		queryTinybirdPipeMock.mockClear();
		useTinybirdTokenMock.mockClear();
		listPresenceProfilesQueryOptionsMock.mockClear();
	});

	it("keeps the online-now query on a 2-minute cadence", async () => {
		const { useOnlineNow } = await useOnlineNowModulePromise;

		await renderHook(() =>
			useOnlineNow({
				websiteSlug: "acme",
			})
		);
		const options = useQueryMock.mock.calls[0]?.[0] as {
			queryFn: () => Promise<unknown>;
			queryKey: unknown[];
			staleTime: number;
			refetchInterval: number;
			enabled: boolean;
		};

		expect(options).toMatchObject({
			queryKey: ["tinybird", "online-now", "acme", 5, "tb-token"],
			staleTime: 120_000,
			refetchInterval: 120_000,
			enabled: true,
		});
		expect(useTinybirdTokenMock.mock.calls[0]).toEqual([
			"acme",
			{ staleTimeMs: 120_000 },
		]);

		await (options as { queryFn: () => Promise<unknown> }).queryFn();

		expect(queryTinybirdPipeMock).toHaveBeenCalledTimes(1);
		expect(queryTinybirdPipeMock.mock.calls[0]).toEqual([
			"online_now",
			{ minutes: 5 },
			"tb-token",
			"https://api.tinybird.test",
		]);
	});

	it("keeps the presence map query on a 2-minute cadence", async () => {
		const { usePresenceLocations } = await usePresenceLocationsModulePromise;

		await renderHook(() =>
			usePresenceLocations({
				websiteSlug: "acme",
			})
		);
		const options = useQueryMock.mock.calls[0]?.[0] as {
			queryFn: () => Promise<unknown>;
			queryKey: unknown[];
			staleTime: number;
			refetchInterval: number;
			enabled: boolean;
		};

		expect(options).toMatchObject({
			queryKey: ["tinybird", "presence-locations", "acme", 5, "tb-token"],
			staleTime: 120_000,
			refetchInterval: 120_000,
			enabled: true,
		});
		expect(useTinybirdTokenMock.mock.calls[0]).toEqual([
			"acme",
			{ staleTimeMs: 120_000 },
		]);

		await (options as { queryFn: () => Promise<unknown> }).queryFn();

		expect(queryTinybirdPipeMock).toHaveBeenCalledTimes(1);
		expect(queryTinybirdPipeMock.mock.calls[0]).toEqual([
			"presence_locations",
			{ minutes: 5 },
			"tb-token",
			"https://api.tinybird.test",
		]);
	});

	it("keeps the live visitor list on a 2-minute cadence and a 5-minute online window", async () => {
		const { useVisitorPresenceData } = await useVisitorPresenceModulePromise;

		await renderHook(() =>
			useVisitorPresenceData({
				websiteSlug: "acme",
			})
		);
		const options = useQueryMock.mock.calls[0]?.[0] as {
			queryFn: () => Promise<unknown>;
			queryKey: unknown[];
			staleTime: number;
			refetchInterval: number;
			refetchOnReconnect: boolean;
			refetchOnWindowFocus: boolean;
			enabled: boolean;
		};

		expect(options).toMatchObject({
			queryKey: [
				"tinybird",
				"visitor-presence",
				"acme",
				5,
				30,
				100,
				"tb-token",
			],
			staleTime: 120_000,
			refetchInterval: 120_000,
			refetchOnReconnect: true,
			refetchOnWindowFocus: true,
			enabled: true,
		});
		expect(useTinybirdTokenMock.mock.calls[0]).toEqual([
			"acme",
			{ staleTimeMs: 120_000 },
		]);

		await (options as { queryFn: () => Promise<unknown> }).queryFn();

		expect(queryTinybirdPipeMock).toHaveBeenCalledTimes(1);
		expect(queryTinybirdPipeMock.mock.calls[0]).toEqual([
			"visitor_presence",
			{
				online_minutes: 5,
				away_minutes: 30,
				limit: 100,
			},
			"tb-token",
			"https://api.tinybird.test",
		]);
		expect(listPresenceProfilesQueryOptionsMock).toHaveBeenCalledTimes(1);
		expect(fetchQueryMock).toHaveBeenCalledTimes(1);
	});

	it("keeps live presence hooks inert when Tinybird is disabled", async () => {
		useTinybirdTokenMock.mockReturnValue({
			data: {
				enabled: false,
				token: null,
				host: null,
				expiresAt: null,
				maxRetentionDays: null,
			},
		});
		const { useOnlineNow } = await useOnlineNowModulePromise;

		await renderHook(() =>
			useOnlineNow({
				websiteSlug: "acme",
			})
		);
		const options = useQueryMock.mock.calls[0]?.[0] as {
			enabled: boolean;
			queryKey: unknown[];
		};

		expect(options.enabled).toBe(false);
		expect(options.queryKey).toEqual([
			"tinybird",
			"online-now",
			"acme",
			5,
			null,
		]);
		expect(queryTinybirdPipeMock).not.toHaveBeenCalled();
	});
});
