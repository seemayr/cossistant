import { beforeEach, describe, expect, it, mock } from "bun:test";

const listWebsiteAccessUsersMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);

mock.module("@api/lib/team-seats", () => ({
	listWebsiteAccessUsers: listWebsiteAccessUsersMock,
}));

const memberQueryModulePromise = import("./member");

function createWebsiteAccessUser(
	overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
	return {
		userId: "user-1",
		name: "Anthony",
		email: "anthony@example.com",
		image: null,
		role: "member",
		joinedAt: new Date("2026-03-01T00:00:00.000Z"),
		updatedAt: new Date("2026-03-02T00:00:00.000Z"),
		lastSeenAt: null,
		...overrides,
	};
}

function createMemberLookupDbMock(rows: Record<string, unknown>[]) {
	return {
		select: () => ({
			from: () => ({
				leftJoin: () => ({
					leftJoin: () => ({
						where: () => ({
							limit: () => ({
								$withCache: async () => rows,
							}),
						}),
					}),
				}),
			}),
		}),
	};
}

describe("getWebsiteMembers", () => {
	beforeEach(() => {
		listWebsiteAccessUsersMock.mockReset();
		listWebsiteAccessUsersMock.mockResolvedValue([]);
	});

	it("loads website-access users and normalizes blank names to null", async () => {
		const db = {};
		listWebsiteAccessUsersMock.mockResolvedValue([
			createWebsiteAccessUser({
				userId: "user-1",
				name: "   ",
				email: "blank@example.com",
			}),
			createWebsiteAccessUser({
				userId: "user-2",
				name: "Alice",
				email: "alice@example.com",
				lastSeenAt: new Date("2026-03-03T04:05:06.000Z"),
			}),
		]);

		const { getWebsiteMembers } = await memberQueryModulePromise;
		const members = await getWebsiteMembers(db as never, {
			organizationId: "org-1",
			websiteTeamId: "team-1",
		});

		expect(listWebsiteAccessUsersMock).toHaveBeenCalledTimes(1);
		expect(listWebsiteAccessUsersMock).toHaveBeenCalledWith(db, {
			organizationId: "org-1",
			teamId: "team-1",
		});
		expect(members).toEqual([
			{
				id: "user-1",
				name: null,
				email: "blank@example.com",
				image: null,
				role: "member",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-02T00:00:00.000Z",
				lastSeenAt: null,
			},
			{
				id: "user-2",
				name: "Alice",
				email: "alice@example.com",
				image: null,
				role: "member",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-02T00:00:00.000Z",
				lastSeenAt: "2026-03-03T04:05:06.000Z",
			},
		]);
	});
});

describe("getWebsiteMemberById", () => {
	beforeEach(() => {
		listWebsiteAccessUsersMock.mockReset();
		listWebsiteAccessUsersMock.mockResolvedValue([]);
	});

	it("returns the requested website member when the user has access", async () => {
		const db = createMemberLookupDbMock([
			{
				id: "user-2",
				name: "Bob",
				email: "bob@example.com",
				image: null,
				role: null,
				createdAt: null,
				updatedAt: new Date("2026-03-02T00:00:00.000Z"),
				lastSeenAt: null,
				teamMemberUserId: "user-2",
			},
		]);

		const { getWebsiteMemberById } = await memberQueryModulePromise;
		const member = await getWebsiteMemberById(db as never, {
			organizationId: "org-1",
			websiteTeamId: "team-1",
			userId: "user-2",
		});

		expect(member).toEqual({
			id: "user-2",
			name: "Bob",
			email: "bob@example.com",
			image: null,
			role: "member",
			createdAt: "2026-03-02T00:00:00.000Z",
			updatedAt: "2026-03-02T00:00:00.000Z",
			lastSeenAt: null,
		});
	});

	it("returns null when the user is not a website member", async () => {
		const db = createMemberLookupDbMock([]);

		const { getWebsiteMemberById } = await memberQueryModulePromise;
		const member = await getWebsiteMemberById(db as never, {
			organizationId: "org-1",
			websiteTeamId: "team-1",
			userId: "missing-user",
		});

		expect(member).toBeNull();
	});
});
