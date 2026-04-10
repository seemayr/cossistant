"use client";

import { useQuery } from "@tanstack/react-query";
import { queryTinybirdPipe, useTinybirdToken } from "@/lib/tinybird";

const PRESENCE_LOCATIONS_REFRESH_INTERVAL_MS = 120_000;

export const PRESENCE_LOCATIONS_QUERY_KEY_PREFIX = [
	"tinybird",
	"presence-locations",
] as const;

type PresenceLocation = {
	latitude: number;
	longitude: number;
	city: string | null;
	country_code: string | null;
	entity_count: number;
};

export function getPresenceLocationsQueryKeyPrefix(websiteSlug: string) {
	return [...PRESENCE_LOCATIONS_QUERY_KEY_PREFIX, websiteSlug] as const;
}

export function usePresenceLocations({
	websiteSlug,
	minutes = 5,
	enabled = true,
}: {
	websiteSlug: string;
	minutes?: number;
	enabled?: boolean;
}) {
	const { data: tokenData } = useTinybirdToken(websiteSlug, {
		staleTimeMs: PRESENCE_LOCATIONS_REFRESH_INTERVAL_MS,
	});
	const tinybirdQueryEnabled =
		enabled &&
		tokenData?.enabled !== false &&
		!!tokenData?.token &&
		!!tokenData?.host;

	return useQuery({
		queryKey: [
			...PRESENCE_LOCATIONS_QUERY_KEY_PREFIX,
			websiteSlug,
			minutes,
			tokenData?.token,
		],
		queryFn: () => {
			const { token, host } = tokenData ?? {};
			if (!(token && host)) {
				throw new Error("Tinybird token not available");
			}
			return queryTinybirdPipe<PresenceLocation>(
				"presence_locations",
				{ minutes },
				token,
				host
			);
		},
		enabled: tinybirdQueryEnabled,
		staleTime: PRESENCE_LOCATIONS_REFRESH_INTERVAL_MS,
		refetchInterval: PRESENCE_LOCATIONS_REFRESH_INTERVAL_MS,
	});
}
