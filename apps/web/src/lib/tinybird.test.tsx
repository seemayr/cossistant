import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const useQueryMock = mock((options: unknown) => options);
const getTinybirdTokenQueryOptionsMock = mock((input: unknown) => ({
	queryKey: ["website.getTinybirdToken", input],
}));

mock.module("@tanstack/react-query", () => ({
	useQuery: useQueryMock,
	useQueryClient: () => ({
		fetchQuery: async () => null,
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		website: {
			getTinybirdToken: {
				queryOptions: getTinybirdTokenQueryOptionsMock,
			},
		},
	}),
}));

const modulePromise = import("./tinybird");
const originalFetch = globalThis.fetch;

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

describe("tinybird web helpers", () => {
	beforeEach(() => {
		useQueryMock.mockClear();
		getTinybirdTokenQueryOptionsMock.mockClear();
		process.env.NEXT_PUBLIC_TINYBIRD_ENABLED = undefined;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("aligns Tinybird token caching with the caller stale time", async () => {
		const { useTinybirdToken } = await modulePromise;

		await renderHook(() =>
			useTinybirdToken("acme", {
				staleTimeMs: 120_000,
			})
		);

		const options = useQueryMock.mock.calls[0]?.[0] as {
			queryKey: unknown[];
			staleTime: number;
			refetchInterval: number;
		};

		expect(options).toMatchObject({
			queryKey: ["website.getTinybirdToken", { websiteSlug: "acme" }],
			staleTime: 120_000,
			refetchInterval: 120_000,
		});
	});

	it("includes Tinybird response details and local recovery hints in query errors", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						error: "The pipe 'unique_visitors' does not exist",
						documentation: "https://docs.tinybird.co/example",
					}),
					{
						status: 404,
						statusText: "Not Found",
						headers: { "Content-Type": "application/json" },
					}
				)
		) as unknown as typeof fetch;

		const { queryTinybirdPipe } = await modulePromise;

		await expect(
			queryTinybirdPipe(
				"unique_visitors",
				{ website_id: "site-1" },
				"tb-token",
				"http://localhost:7181"
			)
		).rejects.toThrow(
			"Tinybird query failed for pipe \"unique_visitors\" on http://localhost:7181 (404 Not Found): The pipe 'unique_visitors' does not exist | docs: https://docs.tinybird.co/example Local Tinybird hint: run scripts/tinybird-local-env.sh"
		);
	});

	it("returns a disabled token state when Tinybird is disabled", async () => {
		process.env.NEXT_PUBLIC_TINYBIRD_ENABLED = "false";
		const { useTinybirdToken } = await modulePromise;

		await renderHook(() =>
			useTinybirdToken("acme", {
				staleTimeMs: 120_000,
			})
		);

		const options = useQueryMock.mock.calls[0]?.[0] as {
			enabled: boolean;
			initialData: {
				enabled: boolean;
				token: null;
				host: null;
				expiresAt: null;
				maxRetentionDays: null;
			};
			queryKey: unknown[];
		};

		expect(getTinybirdTokenQueryOptionsMock).toHaveBeenCalledTimes(1);
		expect(options.enabled).toBe(false);
		expect(options.initialData).toEqual({
			enabled: false,
			token: null,
			host: null,
			expiresAt: null,
			maxRetentionDays: null,
		});
		expect(options.queryKey).toEqual([
			"website.getTinybirdToken",
			{ websiteSlug: "acme" },
		]);
	});
});
