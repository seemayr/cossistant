import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const getWebsiteMemberByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getWebsiteMembersMock = mock((async () => []) as (
	...args: unknown[]
) => Promise<unknown>);

mock.module("@api/db/queries/member", () => ({
	getWebsiteMemberById: getWebsiteMemberByIdMock,
	getWebsiteMembers: getWebsiteMembersMock,
}));

const modulePromise = import("./private-api-key-actor");

describe("resolvePrivateApiKeyActorUser", () => {
	beforeEach(() => {
		getWebsiteMemberByIdMock.mockReset();
		getWebsiteMemberByIdMock.mockResolvedValue({
			id: "user-1",
			name: "Alice",
			email: "alice@example.com",
			image: null,
			role: "member",
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
			lastSeenAt: null,
		});
	});

	it("prefers the linked private key actor over explicit input", async () => {
		const { resolvePrivateApiKeyActorUser } = await modulePromise;

		const result = await resolvePrivateApiKeyActorUser({
			db: {} as never,
			apiKey: {
				keyType: APIKeyType.PRIVATE,
				linkedUserId: "linked-user",
			},
			organizationId: "org-1",
			websiteTeamId: "team-1",
			explicitActorUserId: "header-user",
			required: true,
		});

		expect(getWebsiteMemberByIdMock).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				organizationId: "org-1",
				websiteTeamId: "team-1",
				userId: "linked-user",
			})
		);
		expect(result?.userId).toBe("linked-user");
		expect(result?.source).toBe("linked_key");
	});

	it("uses the explicit actor for unlinked private keys", async () => {
		const { resolvePrivateApiKeyActorUser } = await modulePromise;

		const result = await resolvePrivateApiKeyActorUser({
			db: {} as never,
			apiKey: {
				keyType: APIKeyType.PRIVATE,
				linkedUserId: null,
			},
			organizationId: "org-1",
			websiteTeamId: "team-1",
			explicitActorUserId: "header-user",
			required: true,
		});

		expect(result?.userId).toBe("header-user");
		expect(result?.source).toBe("explicit");
	});

	it("throws when an unlinked private key omits the required actor", async () => {
		const { resolvePrivateApiKeyActorUser } = await modulePromise;

		await expect(
			resolvePrivateApiKeyActorUser({
				db: {} as never,
				apiKey: {
					keyType: APIKeyType.PRIVATE,
					linkedUserId: null,
				},
				organizationId: "org-1",
				websiteTeamId: "team-1",
				required: true,
			})
		).rejects.toMatchObject({
			statusCode: 400,
		});
	});

	it("throws when the resolved actor is not allowed for the website", async () => {
		getWebsiteMemberByIdMock.mockResolvedValueOnce(null);
		const { resolvePrivateApiKeyActorUser } = await modulePromise;

		await expect(
			resolvePrivateApiKeyActorUser({
				db: {} as never,
				apiKey: {
					keyType: APIKeyType.PRIVATE,
					linkedUserId: "user-1",
				},
				organizationId: "org-1",
				websiteTeamId: "team-1",
				required: true,
			})
		).rejects.toMatchObject({
			statusCode: 403,
		});
	});
});
