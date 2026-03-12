/**
 * Utilities for collecting visitor data including browser, device, location,
 * and acquisition tracking information.
 */
/** biome-ignore-all lint/complexity/useOptionalChain: ok */

import type {
	AttributionChannel,
	VisitorAttribution,
	VisitorAttributionClickIds,
	VisitorAttributionUtm,
	VisitorCurrentPage,
} from "./types";

const TRACKED_QUERY_PARAM_KEYS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_content",
	"utm_term",
	"gclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
	"ttclid",
	"li_fat_id",
	"twclid",
] as const;

const SOCIAL_MEDIUMS = new Set([
	"social",
	"social_media",
	"social-network",
	"organic_social",
	"paid_social",
]);

const PAID_MEDIUMS = new Set([
	"paid",
	"cpc",
	"ppc",
	"paid_social",
	"display",
	"retargeting",
	"remarketing",
	"affiliate",
]);

const EMAIL_MEDIUMS = new Set([
	"email",
	"e-mail",
	"newsletter",
	"email_marketing",
]);

const SEARCH_ENGINES = [
	"google.",
	"bing.com",
	"search.yahoo.com",
	"duckduckgo.com",
	"ecosia.org",
	"baidu.com",
	"yandex.",
] as const;

const SOCIAL_DOMAINS = [
	"facebook.com",
	"instagram.com",
	"linkedin.com",
	"twitter.com",
	"x.com",
	"tiktok.com",
	"reddit.com",
	"youtube.com",
	"threads.net",
	"pinterest.com",
] as const;

type VisitorData = {
	browser: string | null;
	browserVersion: string | null;
	os: string | null;
	osVersion: string | null;
	device: string | null;
	deviceType: "desktop" | "mobile" | "tablet" | "unknown";
	language: string | null;
	timezone: string | null;
	screenResolution: string | null;
	viewport: string | null;
	ip: string | null;
	city: string | null;
	region: string | null;
	country: string | null;
	countryCode: string | null;
	latitude: number | null;
	longitude: number | null;
	attribution: VisitorAttribution | null;
	currentPage: VisitorCurrentPage | null;
};

// Browser detection patterns
const EDGE_PATTERN = /Edg\/([0-9.]+)/;
const CHROME_PATTERN = /Chrome\/([0-9.]+)/;
const SAFARI_PATTERN = /Version\/([0-9.]+).*Safari/;
const FIREFOX_PATTERN = /Firefox\/([0-9.]+)/;
const OPERA_PATTERN = /OPR\/([0-9.]+)/;

/**
 * Parse user agent to extract browser information
 */
function parseBrowser(userAgent: string): {
	browser: string | null;
	version: string | null;
} {
	const browsers = [
		{ name: "Edge", pattern: EDGE_PATTERN },
		{ name: "Chrome", pattern: CHROME_PATTERN },
		{ name: "Safari", pattern: SAFARI_PATTERN },
		{ name: "Firefox", pattern: FIREFOX_PATTERN },
		{ name: "Opera", pattern: OPERA_PATTERN },
	];

	for (const { name, pattern } of browsers) {
		const match = userAgent.match(pattern);
		if (match) {
			return { browser: name, version: match[1] || null };
		}
	}

	return { browser: null, version: null };
}

// OS detection patterns
const WINDOWS_PATTERN = /Windows NT ([0-9.]+)/;
const MACOS_PATTERN = /Mac OS X ([0-9_]+)/;
const IOS_PATTERN = /OS ([0-9_]+) like Mac OS X/;
const ANDROID_PATTERN = /Android ([0-9.]+)/;
const LINUX_PATTERN = /Linux/;

const WINDOWS_VERSION_MAP: Record<string, string> = {
	"10.0": "10",
	"6.3": "8.1",
	"6.2": "8",
	"6.1": "7",
};

/**
 * Transform version string by replacing underscores with dots
 */
function transformVersion(version: string): string {
	return version.replace(/_/g, ".");
}

/**
 * Parse user agent to extract OS information
 */
function parseOS(userAgent: string): {
	os: string | null;
	version: string | null;
} {
	const windowsMatch = userAgent.match(WINDOWS_PATTERN);
	if (windowsMatch) {
		const rawVersion = windowsMatch[1];
		let version: string | null = null;
		if (rawVersion) {
			version = WINDOWS_VERSION_MAP[rawVersion] || rawVersion;
		}
		return { os: "Windows", version };
	}

	const macMatch = userAgent.match(MACOS_PATTERN);
	if (macMatch) {
		const version = macMatch[1] ? transformVersion(macMatch[1]) : null;
		return { os: "macOS", version };
	}

	const iosMatch = userAgent.match(IOS_PATTERN);
	if (iosMatch) {
		const version = iosMatch[1] ? transformVersion(iosMatch[1]) : null;
		return { os: "iOS", version };
	}

	const androidMatch = userAgent.match(ANDROID_PATTERN);
	if (androidMatch) {
		return { os: "Android", version: androidMatch[1] || null };
	}

	if (LINUX_PATTERN.test(userAgent)) {
		return { os: "Linux", version: null };
	}

	return { os: null, version: null };
}

// Device type detection patterns
const MOBILE_PATTERN = /Mobile|Android|iPhone|iPod/i;
const TABLET_PATTERN = /iPad|Tablet|Tab/i;

// Device name detection patterns
const IPHONE_PATTERN = /iPhone/;
const IPAD_PATTERN = /iPad/;
const IPOD_PATTERN = /iPod/;
const ANDROID_MOBILE_PATTERN = /Android.*Mobile/;
const ANDROID_TABLET_PATTERN = /Android.*Tablet/;
const WINDOWS_PHONE_PATTERN = /Windows Phone/;
const MACINTOSH_PATTERN = /Macintosh/;
const WINDOWS_PATTERN_DEVICE = /Windows/;
const LINUX_PATTERN_DEVICE = /Linux/;

/**
 * Detect device type from user agent
 */
function detectDeviceType(
	userAgent: string
): "desktop" | "mobile" | "tablet" | "unknown" {
	const isMobile = MOBILE_PATTERN.test(userAgent);
	const isTablet = TABLET_PATTERN.test(userAgent);

	if (isTablet) {
		return "tablet";
	}
	if (isMobile) {
		return "mobile";
	}
	if (
		userAgent.includes("Windows") ||
		userAgent.includes("Mac") ||
		userAgent.includes("Linux")
	) {
		return "desktop";
	}

	return "unknown";
}

/**
 * Get device name from user agent
 */
function getDeviceName(userAgent: string): string | null {
	const devices = [
		{ pattern: IPHONE_PATTERN, name: "iPhone" },
		{ pattern: IPAD_PATTERN, name: "iPad" },
		{ pattern: IPOD_PATTERN, name: "iPod" },
		{ pattern: ANDROID_MOBILE_PATTERN, name: "Android Phone" },
		{ pattern: ANDROID_TABLET_PATTERN, name: "Android Tablet" },
		{ pattern: WINDOWS_PHONE_PATTERN, name: "Windows Phone" },
		{ pattern: MACINTOSH_PATTERN, name: "Mac" },
		{ pattern: WINDOWS_PATTERN_DEVICE, name: "Windows PC" },
		{ pattern: LINUX_PATTERN_DEVICE, name: "Linux PC" },
	];

	for (const { pattern, name } of devices) {
		if (pattern.test(userAgent)) {
			return name;
		}
	}

	return null;
}

/**
 * Check if we're running in a browser environment
 */
function isBrowser(): boolean {
	return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function inferCityFromTimezone(timezone: string | null): string | null {
	if (!timezone?.includes("/")) {
		return null;
	}
	const [, city] = timezone.split("/");
	return city ? city.replace(/_/g, " ") : null;
}

function toNullableString(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeHostname(hostname: string | null | undefined): string | null {
	const normalized = toNullableString(hostname)?.toLowerCase() ?? null;
	if (!normalized) {
		return null;
	}

	return normalized.replace(/^www\./, "");
}

function sanitizeReferrerUrl(url: URL): string {
	const sanitized = new URL(url.toString());
	sanitized.search = "";
	sanitized.hash = "";
	return sanitized.toString();
}

function sanitizePageUrl(url: URL): string {
	const sanitized = new URL(url.toString());
	const params = new URLSearchParams();

	for (const key of TRACKED_QUERY_PARAM_KEYS) {
		const value = sanitized.searchParams.get(key);
		if (value) {
			params.set(key, value);
		}
	}

	sanitized.search = params.toString();
	sanitized.hash = "";
	return sanitized.toString();
}

function buildTrackedPath(url: URL): string {
	return url.pathname || "/";
}

function extractTrackedQueryValue(
	searchParams: URLSearchParams,
	key: string
): string | null {
	return toNullableString(searchParams.get(key));
}

function extractUtmValues(
	searchParams: URLSearchParams
): VisitorAttributionUtm {
	return {
		source: extractTrackedQueryValue(searchParams, "utm_source"),
		medium: extractTrackedQueryValue(searchParams, "utm_medium"),
		campaign: extractTrackedQueryValue(searchParams, "utm_campaign"),
		content: extractTrackedQueryValue(searchParams, "utm_content"),
		term: extractTrackedQueryValue(searchParams, "utm_term"),
	};
}

function extractClickIds(
	searchParams: URLSearchParams
): VisitorAttributionClickIds {
	return {
		gclid: extractTrackedQueryValue(searchParams, "gclid"),
		gbraid: extractTrackedQueryValue(searchParams, "gbraid"),
		wbraid: extractTrackedQueryValue(searchParams, "wbraid"),
		fbclid: extractTrackedQueryValue(searchParams, "fbclid"),
		msclkid: extractTrackedQueryValue(searchParams, "msclkid"),
		ttclid: extractTrackedQueryValue(searchParams, "ttclid"),
		li_fat_id: extractTrackedQueryValue(searchParams, "li_fat_id"),
		twclid: extractTrackedQueryValue(searchParams, "twclid"),
	};
}

function hasClickIds(clickIds: VisitorAttributionClickIds): boolean {
	return Object.values(clickIds).some((value) => Boolean(value));
}

function matchesKnownDomain(
	domain: string,
	domains: readonly string[]
): boolean {
	return domains.some((candidate) => {
		if (candidate.endsWith(".")) {
			return domain.startsWith(candidate);
		}

		return domain === candidate || domain.endsWith(`.${candidate}`);
	});
}

function deriveChannel(params: {
	isDirect: boolean;
	referrerDomain: string | null;
	utmMedium: string | null;
	clickIds: VisitorAttributionClickIds;
}): AttributionChannel {
	const medium = params.utmMedium?.toLowerCase() ?? null;

	if (medium && EMAIL_MEDIUMS.has(medium)) {
		return "email";
	}

	if ((medium && PAID_MEDIUMS.has(medium)) || hasClickIds(params.clickIds)) {
		return "paid";
	}

	if (medium && (SOCIAL_MEDIUMS.has(medium) || medium.includes("social"))) {
		return "social";
	}

	if (
		params.referrerDomain &&
		matchesKnownDomain(params.referrerDomain, SEARCH_ENGINES)
	) {
		return "organic_search";
	}

	if (
		params.referrerDomain &&
		matchesKnownDomain(params.referrerDomain, SOCIAL_DOMAINS)
	) {
		return "social";
	}

	if (params.isDirect) {
		return "direct";
	}

	return "referral";
}

function resolveExternalReferrer(currentUrl: URL): URL | null {
	const referrer = toNullableString(document.referrer);
	if (!referrer) {
		return null;
	}

	try {
		const parsed = new URL(referrer);
		const currentHost = normalizeHostname(currentUrl.hostname);
		const referrerHost = normalizeHostname(parsed.hostname);

		if (!referrerHost || referrerHost === currentHost) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function buildCurrentPage(params: {
	currentUrl: URL;
	externalReferrer: URL | null;
	timestamp: string;
}): VisitorCurrentPage {
	return {
		url: sanitizePageUrl(params.currentUrl),
		path: buildTrackedPath(params.currentUrl),
		title: toNullableString(document.title),
		referrerUrl: params.externalReferrer
			? sanitizeReferrerUrl(params.externalReferrer)
			: null,
		updatedAt: params.timestamp,
	};
}

export function buildAttributionSnapshot(
	timestamp = new Date().toISOString()
): {
	attribution: VisitorAttribution;
	currentPage: VisitorCurrentPage;
} | null {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return null;
	}

	let currentUrl: URL;
	try {
		currentUrl = new URL(window.location.href);
	} catch {
		return null;
	}

	const externalReferrer = resolveExternalReferrer(currentUrl);
	const utm = extractUtmValues(currentUrl.searchParams);
	const clickIds = extractClickIds(currentUrl.searchParams);
	const referrerDomain = externalReferrer
		? normalizeHostname(externalReferrer.hostname)
		: null;
	const hasCampaignSignals =
		Boolean(
			utm.source || utm.medium || utm.campaign || utm.content || utm.term
		) || hasClickIds(clickIds);
	const isDirect = !(referrerDomain || hasCampaignSignals);
	const currentPage = buildCurrentPage({
		currentUrl,
		externalReferrer,
		timestamp,
	});

	return {
		attribution: {
			version: 1,
			firstTouch: {
				channel: deriveChannel({
					isDirect,
					referrerDomain,
					utmMedium: utm.medium,
					clickIds,
				}),
				isDirect,
				referrer: {
					url: externalReferrer ? sanitizeReferrerUrl(externalReferrer) : null,
					domain: referrerDomain,
				},
				landing: {
					url: currentPage.url,
					path: currentPage.path,
					title: currentPage.title,
				},
				utm,
				clickIds,
				capturedAt: timestamp,
			},
		},
		currentPage,
	};
}

/**
 * Collect visitor data from the browser environment.
 * Returns null if not in browser environment.
 */
export async function collectVisitorData(): Promise<VisitorData | null> {
	if (!isBrowser()) {
		return null;
	}

	const userAgent = navigator.userAgent || "";
	const { browser, version: browserVersion } = parseBrowser(userAgent);
	const { os, version: osVersion } = parseOS(userAgent);
	const language = navigator.language || null;
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
	const inferredCity = inferCityFromTimezone(timezone);
	const timestamp = new Date().toISOString();
	const trackingSnapshot = buildAttributionSnapshot(timestamp);

	return {
		browser,
		browserVersion,
		os,
		osVersion,
		device: getDeviceName(userAgent),
		deviceType: detectDeviceType(userAgent),
		language,
		timezone,
		screenResolution:
			typeof window !== "undefined" && window.screen
				? `${window.screen.width}x${window.screen.height}`
				: null,
		viewport:
			typeof window !== "undefined"
				? `${window.innerWidth}x${window.innerHeight}`
				: null,
		ip: null,
		city: inferredCity,
		region: null,
		country: null,
		countryCode: null,
		latitude: null,
		longitude: null,
		attribution: trackingSnapshot?.attribution ?? null,
		currentPage: trackingSnapshot?.currentPage ?? null,
	};
}

export type { VisitorData };
