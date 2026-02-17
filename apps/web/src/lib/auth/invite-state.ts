import { getSafeRelativeCallbackPath } from "./callback";

type SearchParamsLike = {
	get: (key: string) => string | null;
};

export type InviteAuthState = {
	callbackPath: string;
	isInviteFlow: boolean;
	inviteEmail: string | null;
	inviteTarget: string | null;
};

export type InviteAwarePath =
	| "/login"
	| "/sign-up"
	| "/forgot-password"
	| "/reset-password";

type ExtraSearchValue = string | number | boolean | null | undefined;

const RESERVED_SEARCH_KEYS = new Set([
	"callback",
	"invite",
	"inviteEmail",
	"inviteTarget",
]);

function decodeValue(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function sanitizeValue(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const normalized = decodeValue(value).trim();
	if (!normalized) {
		return null;
	}

	return normalized;
}

function sanitizeInviteEmail(value: string | null | undefined): string | null {
	const normalized = sanitizeValue(value)?.toLowerCase();
	if (!normalized) {
		return null;
	}

	if (!(normalized.includes("@") && normalized.length <= 320)) {
		return null;
	}

	return normalized;
}

function sanitizeInviteTarget(value: string | null | undefined): string | null {
	const normalized = sanitizeValue(value);
	if (!normalized) {
		return null;
	}

	return normalized.slice(0, 120);
}

export function readInviteAuthState(
	searchParams: SearchParamsLike,
	fallbackCallback = "/select"
): InviteAuthState {
	const callbackPath = getSafeRelativeCallbackPath(
		searchParams.get("callback"),
		fallbackCallback
	);
	const isInviteFlow = searchParams.get("invite") === "1";

	if (!isInviteFlow) {
		return {
			callbackPath,
			isInviteFlow: false,
			inviteEmail: null,
			inviteTarget: null,
		};
	}

	return {
		callbackPath,
		isInviteFlow: true,
		inviteEmail: sanitizeInviteEmail(searchParams.get("inviteEmail")),
		inviteTarget: sanitizeInviteTarget(searchParams.get("inviteTarget")),
	};
}

export function buildInviteAuthPath(
	authPath: "/login" | "/sign-up",
	params: {
		callbackPath: string;
		inviteEmail?: string | null;
		inviteTarget?: string | null;
	}
): string {
	return buildInviteAwarePath(authPath, params);
}

export function buildInviteAwarePath(
	path: InviteAwarePath,
	params: {
		callbackPath: string;
		inviteEmail?: string | null;
		inviteTarget?: string | null;
		extraSearchParams?: Record<string, ExtraSearchValue>;
	}
): string {
	const searchParams = new URLSearchParams();

	searchParams.set(
		"callback",
		getSafeRelativeCallbackPath(params.callbackPath, "/select")
	);
	searchParams.set("invite", "1");

	const inviteEmail = sanitizeInviteEmail(params.inviteEmail);
	if (inviteEmail) {
		searchParams.set("inviteEmail", inviteEmail);
	}

	const inviteTarget = sanitizeInviteTarget(params.inviteTarget);
	if (inviteTarget) {
		searchParams.set("inviteTarget", inviteTarget);
	}

	if (params.extraSearchParams) {
		for (const [key, rawValue] of Object.entries(params.extraSearchParams)) {
			if (RESERVED_SEARCH_KEYS.has(key)) {
				continue;
			}

			if (rawValue === null || rawValue === undefined) {
				continue;
			}

			const value = String(rawValue).trim();
			if (!value) {
				continue;
			}

			searchParams.set(key, value);
		}
	}

	return `${path}?${searchParams.toString()}`;
}
