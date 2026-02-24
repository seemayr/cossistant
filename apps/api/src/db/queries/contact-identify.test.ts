import { describe, expect, it, mock } from "bun:test";
import { contact } from "../schema";
import { identifyContact } from "./contact";

describe("identifyContact", () => {
	it("upserts by externalId using conflict target, reactivates, and merges metadata", async () => {
		const returnedContact = {
			id: "contact-1",
			websiteId: "site-1",
			organizationId: "org-1",
			externalId: "user-123",
			email: "user@example.com",
			name: "User",
			image: null,
			metadata: { plan: "pro", role: "admin" },
			contactOrganizationId: null,
			userId: null,
			createdAt: "2026-02-24T01:00:00.000Z",
			updatedAt: "2026-02-24T01:00:00.000Z",
			deletedAt: null,
			notificationSettings: null,
		};

		const returningMock = mock((async () => [returnedContact]) as () => Promise<
			unknown[]
		>);
		const onConflictDoUpdateMock = mock((() => ({
			returning: returningMock,
		})) as (args: unknown) => { returning: () => Promise<unknown[]> });
		const valuesMock = mock((() => ({
			onConflictDoUpdate: onConflictDoUpdateMock,
		})) as (values: unknown) => {
			onConflictDoUpdate: (args: unknown) => {
				returning: () => Promise<unknown[]>;
			};
		});
		const insertMock = mock((() => ({
			values: valuesMock,
		})) as (table: unknown) => {
			values: (values: unknown) => {
				onConflictDoUpdate: (args: unknown) => {
					returning: () => Promise<unknown[]>;
				};
			};
		});

		const db = {
			insert: insertMock,
		};

		const result = await identifyContact(db as never, {
			websiteId: "site-1",
			organizationId: "org-1",
			externalId: "user-123",
			email: "user@example.com",
			name: "User",
			metadata: { plan: "pro", role: "admin" },
		});

		expect(result).toEqual(returnedContact);
		expect(insertMock).toHaveBeenCalledTimes(1);
		expect(valuesMock).toHaveBeenCalledTimes(1);
		expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);

		const conflictArg = onConflictDoUpdateMock.mock.calls[0]?.[0] as {
			target: unknown[];
			set: Record<string, unknown>;
		};

		expect(conflictArg.target).toEqual([contact.externalId, contact.websiteId]);
		expect(conflictArg.set.deletedAt).toBeNull();
		expect(conflictArg.set.updatedAt).toEqual(expect.any(String));

		const metadataSql = conflictArg.set.metadata as {
			queryChunks?: unknown[];
		};
		expect(Array.isArray(metadataSql.queryChunks)).toBe(true);
		expect((metadataSql.queryChunks ?? []).length).toBeGreaterThan(0);
	});

	it("keeps email-only update path and merges metadata in-memory", async () => {
		const existingContact = {
			id: "contact-existing",
			metadata: { plan: "basic", role: "member" },
		};
		const updatedContact = {
			id: "contact-existing",
			metadata: { plan: "pro", role: "member", seats: 3 },
		};

		const selectLimitMock = mock((async () => [
			existingContact,
		]) as () => Promise<unknown[]>);
		const selectWhereMock = mock((() => ({
			limit: selectLimitMock,
		})) as (where: unknown) => { limit: () => Promise<unknown[]> });
		const selectFromMock = mock((() => ({
			where: selectWhereMock,
		})) as (table: unknown) => {
			where: (where: unknown) => { limit: () => Promise<unknown[]> };
		});
		const selectMock = mock((() => ({
			from: selectFromMock,
		})) as () => {
			from: (table: unknown) => {
				where: (where: unknown) => { limit: () => Promise<unknown[]> };
			};
		});

		const updateReturningMock = mock((async () => [
			updatedContact,
		]) as () => Promise<unknown[]>);
		const updateWhereMock = mock((() => ({
			returning: updateReturningMock,
		})) as (where: unknown) => { returning: () => Promise<unknown[]> });
		const updateSetMock = mock((() => ({
			where: updateWhereMock,
		})) as (set: unknown) => {
			where: (where: unknown) => { returning: () => Promise<unknown[]> };
		});
		const updateMock = mock((() => ({
			set: updateSetMock,
		})) as (table: unknown) => {
			set: (set: unknown) => {
				where: (where: unknown) => { returning: () => Promise<unknown[]> };
			};
		});

		const db = {
			select: selectMock,
			update: updateMock,
		};

		const result = await identifyContact(db as never, {
			websiteId: "site-1",
			organizationId: "org-1",
			email: "user@example.com",
			metadata: { plan: "pro", seats: 3 },
		});

		expect(result).toEqual(expect.objectContaining(updatedContact));
		expect(updateSetMock).toHaveBeenCalledTimes(1);

		const updateArg = updateSetMock.mock.calls[0]?.[0] as {
			metadata: Record<string, unknown>;
		};

		expect(updateArg.metadata).toEqual({
			plan: "pro",
			role: "member",
			seats: 3,
		});
	});
});
