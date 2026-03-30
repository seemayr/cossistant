import { BlockList, isIP } from "node:net";
import type { HonoRequest } from "hono";

type HeaderGetter = (name: string) => string | null | undefined;

const NON_PUBLIC_IPS = new BlockList();

for (const [address, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const) {
	NON_PUBLIC_IPS.addSubnet(address, prefix, "ipv4");
}

for (const [address, prefix] of [
	["::", 128],
	["::1", 128],
	["2001:db8::", 32],
	["fc00::", 7],
	["fe80::", 10],
	["ff00::", 8],
] as const) {
	NON_PUBLIC_IPS.addSubnet(address, prefix, "ipv6");
}

export type ClientIpInfo = {
	canonicalIp: string | null;
	publicIp: string | null;
};

export type DevelopmentClientIpOverrideOptions = {
	nodeEnv: string | null | undefined;
	overrideIp: string | null | undefined;
	warn?: (message: string) => void;
};

function stripQuotes(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}

	return value;
}

export function normalizeIpCandidate(
	value: string | null | undefined
): string | null {
	if (!value) {
		return null;
	}

	let normalized = stripQuotes(value.trim());
	if (!normalized) {
		return null;
	}

	if (normalized.startsWith("[")) {
		const closingBracketIndex = normalized.indexOf("]");
		if (closingBracketIndex === -1) {
			return null;
		}
		normalized = normalized.slice(1, closingBracketIndex);
	}

	const zoneIndex = normalized.indexOf("%");
	if (zoneIndex !== -1) {
		normalized = normalized.slice(0, zoneIndex);
	}

	if (isIP(normalized)) {
		return normalized;
	}

	const lastColonIndex = normalized.lastIndexOf(":");
	if (lastColonIndex === -1) {
		return null;
	}

	const host = normalized.slice(0, lastColonIndex);
	return isIP(host) === 4 ? host : null;
}

export function isPublicIp(ip: string | null | undefined): boolean {
	if (!ip) {
		return false;
	}

	const family = isIP(ip);
	if (family === 0) {
		return false;
	}

	return !NON_PUBLIC_IPS.check(ip, family === 4 ? "ipv4" : "ipv6");
}

export function parseForwardedHeader(
	headerValue: string | null | undefined
): string | null {
	if (!headerValue) {
		return null;
	}

	for (const segment of headerValue.split(",")) {
		const forDirective = segment
			.split(";")
			.map((part) => part.trim())
			.find((part) => part.toLowerCase().startsWith("for="));

		if (!forDirective) {
			continue;
		}

		const normalized = normalizeIpCandidate(forDirective.slice(4).trim());
		if (normalized) {
			return normalized;
		}
	}

	return null;
}

function getFirstForwardedForIp(
	headerValue: string | null | undefined,
	requirePublic: boolean
): string | null {
	if (!headerValue) {
		return null;
	}

	for (const segment of headerValue.split(",")) {
		const normalized = normalizeIpCandidate(segment);
		if (!normalized) {
			continue;
		}

		if (!requirePublic || isPublicIp(normalized)) {
			return normalized;
		}
	}

	return null;
}

export function extractClientIp(getHeader: HeaderGetter): ClientIpInfo {
	const forwardedForCanonical = getFirstForwardedForIp(
		getHeader("x-forwarded-for"),
		false
	);
	const forwardedForPublic = getFirstForwardedForIp(
		getHeader("x-forwarded-for"),
		true
	);
	const xRealIp = normalizeIpCandidate(getHeader("x-real-ip"));
	const forwarded = parseForwardedHeader(getHeader("forwarded"));
	const cfConnectingIp = normalizeIpCandidate(getHeader("cf-connecting-ip"));
	const xClientIp = normalizeIpCandidate(getHeader("x-client-ip"));

	const canonicalCandidates = [
		forwardedForCanonical,
		xRealIp,
		forwarded,
		cfConnectingIp,
		xClientIp,
	];
	const publicCandidates = [
		isPublicIp(forwardedForCanonical) ? forwardedForCanonical : null,
		forwardedForPublic,
		isPublicIp(xRealIp) ? xRealIp : null,
		isPublicIp(forwarded) ? forwarded : null,
		isPublicIp(cfConnectingIp) ? cfConnectingIp : null,
		isPublicIp(xClientIp) ? xClientIp : null,
	];

	return {
		canonicalIp: canonicalCandidates.find(Boolean) ?? null,
		publicIp: publicCandidates.find(Boolean) ?? null,
	};
}

export function applyDevelopmentClientIpOverride(
	ipInfo: ClientIpInfo,
	options: DevelopmentClientIpOverrideOptions
): ClientIpInfo {
	const overrideIp = options.overrideIp?.trim();
	if (options.nodeEnv !== "development" || !overrideIp) {
		return ipInfo;
	}

	const normalizedOverride = normalizeIpCandidate(overrideIp);
	if (!(normalizedOverride && isPublicIp(normalizedOverride))) {
		options.warn?.(
			`Ignoring LOCAL_VISITOR_IP_OVERRIDE="${overrideIp}" because it is not a valid public IP address.`
		);
		return ipInfo;
	}

	if (isPublicIp(ipInfo.canonicalIp) || isPublicIp(ipInfo.publicIp)) {
		return ipInfo;
	}

	return {
		canonicalIp: normalizedOverride,
		publicIp: normalizedOverride,
	};
}

export function extractClientIpFromRequest(request: HonoRequest): ClientIpInfo {
	return extractClientIp((name) => request.header(name));
}
