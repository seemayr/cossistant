import type { Database } from "@api/db";
import { listWebsiteAccessUsers } from "@api/lib/team-seats";

// Check if user has access to a website
export async function getWebsiteMembers(
	db: Database,
	params: {
		organizationId: string;
		websiteTeamId: string;
	}
) {
	const members = await listWebsiteAccessUsers(db, {
		organizationId: params.organizationId,
		teamId: params.websiteTeamId,
	});

	return members.map((member) => ({
		id: member.userId,
		name: member.name ?? undefined,
		email: member.email,
		image: member.image,
		role: member.role,
		createdAt: (
			member.joinedAt ??
			member.updatedAt ??
			new Date()
		).toISOString(),
		updatedAt: (member.updatedAt ?? new Date()).toISOString(),
		lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
	}));
}
