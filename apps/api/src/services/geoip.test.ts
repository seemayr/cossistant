import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const redisGetMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const redisSetMock = mock(
	(async () => "OK") as (...args: unknown[]) => Promise<unknown>
);

mock.module("@api/env", () => ({
	env: {
		GEOIP_SERVICE_URL: "http://geoip.internal",
	},
}));

mock.module("@api/redis", () => ({
	getRedis: () => ({
		get: redisGetMock,
		set: redisSetMock,
	}),
}));

const modulePromise = import("./geoip");

describe("lookupGeoIp", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		redisGetMock.mockReset();
		redisSetMock.mockReset();
		redisGetMock.mockResolvedValue(null);
		redisSetMock.mockResolvedValue("OK");
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns cached results without hitting the geo service", async () => {
		redisGetMock.mockResolvedValue(
			JSON.stringify({
				ip: "8.8.8.8",
				found: true,
				is_public: true,
				country_code: "US",
				country: "United States",
				region: "California",
				city: "Mountain View",
				latitude: 37.386,
				longitude: -122.0838,
				timezone: "America/Los_Angeles",
				accuracy_radius_km: 20,
				asn: 15_169,
				asn_organization: "Google LLC",
				source: "maxmind",
				resolved_at: "2026-03-28T00:00:00.000Z",
			})
		);
		const { lookupGeoIp } = await modulePromise;

		const result = await lookupGeoIp("8.8.8.8");

		expect(result?.city).toBe("Mountain View");
		expect(redisSetMock).not.toHaveBeenCalled();
	});

	it("caches successful geo service lookups", async () => {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					ip: "8.8.8.8",
					found: true,
					is_public: true,
					country_code: "US",
					country: "United States",
					region: "California",
					city: "Mountain View",
					latitude: 37.386,
					longitude: -122.0838,
					timezone: "America/Los_Angeles",
					accuracy_radius_km: 20,
					asn: 15_169,
					asn_organization: "Google LLC",
					source: "maxmind",
					resolved_at: "2026-03-28T00:00:00.000Z",
				}),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
					},
				}
			)) as unknown as typeof fetch;

		const { lookupGeoIp } = await modulePromise;
		const result = await lookupGeoIp("8.8.8.8");

		expect(result?.country_code).toBe("US");
		expect(redisSetMock).toHaveBeenCalledTimes(1);
	});
});
