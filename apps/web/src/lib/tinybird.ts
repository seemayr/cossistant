"use client";

import { useQuery } from "@tanstack/react-query";
import { isTinybirdEnabled } from "@/lib/analytics-flags";
import { useTRPC } from "@/lib/trpc/client";

const DEFAULT_TOKEN_STALE_TIME_MS = 300_000;
const LOCAL_TINYBIRD_RECOVERY_HINT =
	"Local Tinybird hint: run scripts/tinybird-local-env.sh, copy TINYBIRD_TOKEN/TINYBIRD_SIGNING_KEY/TINYBIRD_WORKSPACE into apps/api/.env and apps/workers/.env, restart API/workers, then hard refresh the dashboard.";

export type TinybirdTokenQueryData =
	| {
			enabled: true;
			token: string;
			host: string;
			expiresAt: number;
			maxRetentionDays: number;
	  }
	| {
			enabled: false;
			token: null;
			host: null;
			expiresAt: null;
			maxRetentionDays: null;
	  };

const DISABLED_TINYBIRD_TOKEN_DATA: TinybirdTokenQueryData = {
	enabled: false,
	token: null,
	host: null,
	expiresAt: null,
	maxRetentionDays: null,
};

function isLocalTinybirdHost(host: string): boolean {
	try {
		const url = new URL(host);
		return url.hostname === "localhost" || url.hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

export function useTinybirdToken(
	websiteSlug: string,
	{ staleTimeMs = DEFAULT_TOKEN_STALE_TIME_MS }: { staleTimeMs?: number } = {}
) {
	const trpc = useTRPC();
	const tinybirdEnabled = isTinybirdEnabled();
	const queryOptions = trpc.website.getTinybirdToken.queryOptions({
		websiteSlug,
	});

	return useQuery({
		...queryOptions,
		...(tinybirdEnabled
			? {}
			: {
					queryFn: async () => DISABLED_TINYBIRD_TOKEN_DATA,
					initialData: DISABLED_TINYBIRD_TOKEN_DATA,
				}),
		enabled: tinybirdEnabled,
		staleTime: staleTimeMs,
		refetchInterval: staleTimeMs,
	});
}

async function readTinybirdErrorDetails(response: Response): Promise<string> {
	const bodyText = await response.text();
	if (!bodyText) {
		return response.statusText || "No response body";
	}

	try {
		const parsed = JSON.parse(bodyText) as {
			error?: unknown;
			documentation?: unknown;
		};
		const details: string[] = [];
		if (typeof parsed.error === "string" && parsed.error.length > 0) {
			details.push(parsed.error);
		}
		if (
			typeof parsed.documentation === "string" &&
			parsed.documentation.length > 0
		) {
			details.push(`docs: ${parsed.documentation}`);
		}
		if (details.length > 0) {
			return details.join(" | ");
		}
	} catch {
		// Response body is not JSON; fall through to raw text.
	}

	return bodyText;
}

export async function queryTinybirdPipe<T>(
	pipe: string,
	params: Record<string, string | number>,
	token: string,
	host: string
): Promise<T[]> {
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		searchParams.set(key, String(value));
	}
	const response = await fetch(
		`${host}/v0/pipes/${pipe}.json?${searchParams}`,
		{
			headers: { Authorization: `Bearer ${token}` },
		}
	);
	if (!response.ok) {
		const errorDetails = await readTinybirdErrorDetails(response);
		const localhostHint =
			isLocalTinybirdHost(host) && [401, 403, 404].includes(response.status)
				? ` ${LOCAL_TINYBIRD_RECOVERY_HINT}`
				: "";
		throw new Error(
			`Tinybird query failed for pipe "${pipe}" on ${host} (${response.status} ${response.statusText}): ${errorDetails}${localhostHint}`
		);
	}
	const result = await response.json();
	return result.data;
}
