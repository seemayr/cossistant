"use client";

import { useQuery } from "@tanstack/react-query";
import { queryTinybirdPipe, useTinybirdToken } from "@/lib/tinybird";

const ONLINE_NOW_REFRESH_INTERVAL_MS = 30_000;

export const ONLINE_NOW_QUERY_KEY_PREFIX = ["tinybird", "online-now"] as const;

export type OnlineEntity = {
	entity_id: string;
	entity_type: "visitor" | "user";
	name: string;
	image: string;
	country_code: string | null;
	city: string | null;
	latitude: number | null;
	longitude: number | null;
	last_seen: string;
};

export function getOnlineNowQueryKeyPrefix(websiteSlug: string) {
	return [...ONLINE_NOW_QUERY_KEY_PREFIX, websiteSlug] as const;
}

export function isVisitorOnlineEntity(entity: OnlineEntity) {
	return entity.entity_type === "visitor";
}

export function useOnlineNow({
	websiteSlug,
	minutes = 10,
	enabled = true,
}: {
	websiteSlug: string;
	minutes?: number;
	enabled?: boolean;
}) {
	const { data: tokenData } = useTinybirdToken(websiteSlug);

	return useQuery({
		queryKey: [...ONLINE_NOW_QUERY_KEY_PREFIX, websiteSlug, minutes],
		queryFn: () => {
			const { token, host } = tokenData ?? {};
			if (!(token && host)) {
				throw new Error("Tinybird token not available");
			}
			return queryTinybirdPipe<OnlineEntity>(
				"online_now",
				{ minutes },
				token,
				host
			);
		},
		enabled: enabled && !!tokenData,
		staleTime: ONLINE_NOW_REFRESH_INTERVAL_MS,
		refetchInterval: ONLINE_NOW_REFRESH_INTERVAL_MS,
	});
}
