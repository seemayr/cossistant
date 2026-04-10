import { describe, expect, it } from "bun:test";
import type { Database } from "@api/db";
import {
	isOrganizationAdminOrOwner,
	isOrganizationOwner,
	isTeamMember,
} from "./access-control";

function createDbMock(rows: Record<string, string>[]): Database {
	return {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => ({
						$withCache: async () => rows,
					}),
				}),
			}),
		}),
	} as unknown as Database;
}

describe("access-control ownership checks", () => {
	it("returns true when owner membership exists", async () => {
		const db = createDbMock([{ id: "member_1" }]);

		const isOwner = await isOrganizationOwner(db, {
			userId: "user_1",
			organizationId: "org_1",
		});

		expect(isOwner).toBe(true);
	});

	it("returns false when owner membership does not exist", async () => {
		const db = createDbMock([]);

		const isOwner = await isOrganizationOwner(db, {
			userId: "user_1",
			organizationId: "org_1",
		});

		expect(isOwner).toBe(false);
	});

	it("returns true for admin-or-owner checks when membership exists", async () => {
		const db = createDbMock([{ id: "member_1" }]);

		const hasAccess = await isOrganizationAdminOrOwner(db, {
			userId: "user_1",
			organizationId: "org_1",
		});

		expect(hasAccess).toBe(true);
	});

	it("returns true when a team membership exists", async () => {
		const db = createDbMock([{ userId: "user_1" }]);

		const hasAccess = await isTeamMember(db, {
			userId: "user_1",
			teamId: "team_1",
		});

		expect(hasAccess).toBe(true);
	});
});
