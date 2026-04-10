import type { Database } from "@api/db";
import { SECURITY_CACHE_CONFIG } from "@api/db/cache/config";
import type { UserSelect } from "@api/db/schema";
import { session, user } from "@api/db/schema";
import { auth } from "@api/lib/auth";
import type { Session, User } from "better-auth";

import { and, eq, gt } from "drizzle-orm";

const MAX_SESSION_TOKEN_LENGTH = 512;

export function normalizeSessionToken(
	token: string | null | undefined
): string | undefined {
	if (!token) {
		return;
	}

	const trimmed = token.trim();
	if (!trimmed) {
		return;
	}

	if (trimmed.length > MAX_SESSION_TOKEN_LENGTH) {
		return;
	}

	return trimmed;
}

export async function resolveSession(
	db: Database,
	params: {
		headers: Headers;
		sessionToken?: string | null;
	}
) {
	let foundSession: {
		session: Session & {
			activeOrganizationId?: string | null | undefined;
			activeTeamId?: string | null | undefined;
		};
		user: UserSelect;
	} | null = null;

	const betterAuthSession = await auth.api.getSession({
		headers: params.headers,
	});

	const now = new Date();

	// Normalize and validate the cookie token from better-auth
	const normalizedCookieToken = normalizeSessionToken(
		betterAuthSession?.session?.token
	);

	// Try the cookie token first (most trusted source)
	if (normalizedCookieToken) {
		const [res] = await db
			.select()
			.from(session)
			.where(
				and(
					eq(session.token, normalizedCookieToken),
					gt(session.expiresAt, now)
				)
			)
			.innerJoin(user, eq(session.userId, user.id))
			.limit(1)
			.$withCache({
				config: SECURITY_CACHE_CONFIG,
			});

		if (res) {
			foundSession = {
				session: res.session,
				user: res.user,
			};

			return foundSession;
		}
	}

	// Only check fallback tokens if no valid cookie session exists
	const tokensToCheck = new Set<string>();

	const normalizedOverride = normalizeSessionToken(params.sessionToken);

	if (normalizedOverride) {
		tokensToCheck.add(normalizedOverride);
	}

	const headerToken = normalizeSessionToken(
		params.headers.get("x-user-session-token")
	);

	if (headerToken) {
		tokensToCheck.add(headerToken);
	}

	// Check fallback tokens
	for (const token of tokensToCheck) {
		const [res] = await db
			.select()
			.from(session)
			.where(and(eq(session.token, token), gt(session.expiresAt, now)))
			.innerJoin(user, eq(session.userId, user.id))
			.limit(1)
			.$withCache({
				config: SECURITY_CACHE_CONFIG,
			});

		if (res) {
			foundSession = {
				session: res.session,
				user: res.user,
			};

			break;
		}
	}

	return foundSession;
}

export async function getTRPCSession(
	db: Database,
	params: {
		headers: Headers;
	}
) {
	return await resolveSession(db, { headers: params.headers });
}
