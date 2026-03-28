import { env } from "@api/env";
import { getRedis } from "@api/redis";

const GEOIP_CACHE_TTL_SECONDS = 60 * 60 * 24;
const GEOIP_REQUEST_TIMEOUT_MS = 1500;
const TRAILING_SLASHES_REGEX = /\/+$/;

export type GeoIpLookupResult = {
	ip: string;
	found: boolean;
	is_public: boolean;
	country_code: string | null;
	country: string | null;
	region: string | null;
	city: string | null;
	latitude: number | null;
	longitude: number | null;
	timezone: string | null;
	accuracy_radius_km: number | null;
	asn: number | null;
	asn_organization: string | null;
	source: string;
	resolved_at: string;
};

function getGeoIpCacheKey(ip: string): string {
	return `geoip:lookup:${ip}`;
}

function normalizeLookupResult(value: unknown): GeoIpLookupResult | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const record = value as Record<string, unknown>;
	if (
		typeof record.ip !== "string" ||
		typeof record.found !== "boolean" ||
		typeof record.is_public !== "boolean" ||
		typeof record.source !== "string" ||
		typeof record.resolved_at !== "string"
	) {
		return null;
	}

	return {
		ip: record.ip,
		found: record.found,
		is_public: record.is_public,
		country_code:
			typeof record.country_code === "string" ? record.country_code : null,
		country: typeof record.country === "string" ? record.country : null,
		region: typeof record.region === "string" ? record.region : null,
		city: typeof record.city === "string" ? record.city : null,
		latitude: typeof record.latitude === "number" ? record.latitude : null,
		longitude: typeof record.longitude === "number" ? record.longitude : null,
		timezone: typeof record.timezone === "string" ? record.timezone : null,
		accuracy_radius_km:
			typeof record.accuracy_radius_km === "number"
				? record.accuracy_radius_km
				: null,
		asn: typeof record.asn === "number" ? record.asn : null,
		asn_organization:
			typeof record.asn_organization === "string"
				? record.asn_organization
				: null,
		source: record.source,
		resolved_at: record.resolved_at,
	};
}

export async function lookupGeoIp(
	ip: string
): Promise<GeoIpLookupResult | null> {
	const redis = getRedis();
	const cacheKey = getGeoIpCacheKey(ip);

	try {
		const cached = await redis.get(cacheKey);
		if (cached) {
			const parsed = normalizeLookupResult(JSON.parse(cached));
			if (parsed) {
				return parsed;
			}
		}
	} catch (error) {
		console.warn("[geoip] Failed to read cache", { ip, error });
	}

	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		GEOIP_REQUEST_TIMEOUT_MS
	);

	try {
		const response = await fetch(
			`${env.GEOIP_SERVICE_URL.replace(TRAILING_SLASHES_REGEX, "")}/v1/lookup`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ip }),
				signal: controller.signal,
			}
		);

		if (!response.ok) {
			console.warn("[geoip] Lookup request failed", {
				ip,
				status: response.status,
			});
			return null;
		}

		const parsed = normalizeLookupResult(await response.json());
		if (!parsed) {
			console.warn("[geoip] Lookup response was invalid", { ip });
			return null;
		}

		try {
			await redis.set(
				cacheKey,
				JSON.stringify(parsed),
				"EX",
				GEOIP_CACHE_TTL_SECONDS
			);
		} catch (error) {
			console.warn("[geoip] Failed to write cache", { ip, error });
		}

		return parsed;
	} catch (error) {
		console.warn("[geoip] Lookup request errored", { ip, error });
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
