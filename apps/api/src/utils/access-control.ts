import type { Database } from "@api/db";
import { SECURITY_CACHE_CONFIG } from "@api/db/cache/config";
import { member, teamMember } from "@api/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const ORGANIZATION_ADMIN_ROLES = ["owner", "admin"] as const;

export type OrganizationAdminRole = (typeof ORGANIZATION_ADMIN_ROLES)[number];

export async function isOrganizationAdminOrOwner(
	db: Database,
	params: { userId: string; organizationId: string }
): Promise<boolean> {
	const [result] = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(
				eq(member.userId, params.userId),
				eq(member.organizationId, params.organizationId),
				inArray(member.role, ORGANIZATION_ADMIN_ROLES)
			)
		)
		.limit(1)
		.$withCache({
			config: SECURITY_CACHE_CONFIG,
		});

	return Boolean(result);
}

export async function isOrganizationOwner(
	db: Database,
	params: { userId: string; organizationId: string }
): Promise<boolean> {
	const [result] = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(
				eq(member.userId, params.userId),
				eq(member.organizationId, params.organizationId),
				eq(member.role, "owner")
			)
		)
		.limit(1)
		.$withCache({
			config: SECURITY_CACHE_CONFIG,
		});

	return Boolean(result);
}

export async function isTeamMember(
	db: Database,
	params: { userId: string; teamId: string }
): Promise<boolean> {
	const [result] = await db
		.select({ userId: teamMember.userId })
		.from(teamMember)
		.where(
			and(
				eq(teamMember.userId, params.userId),
				eq(teamMember.teamId, params.teamId)
			)
		)
		.limit(1)
		.$withCache({
			config: SECURITY_CACHE_CONFIG,
		});

	return Boolean(result);
}
