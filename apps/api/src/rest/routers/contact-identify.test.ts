import { beforeEach, describe, expect, it, mock } from "bun:test";
import { APIKeyType } from "@cossistant/types";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);

const createContactMock = mock((async () => ({
	id: "contact-created",
	externalId: null,
	websiteId: "site-1",
	organizationId: "org-1",
	createdAt: "2026-02-24T01:00:00.000Z",
	updatedAt: "2026-02-24T01:00:00.000Z",
})) as (...args: unknown[]) => Promise<unknown>);
const upsertContactByExternalIdMock = mock((async () => ({
	status: "created",
	contact: {
		id: "contact-upserted",
		externalId: "user-123",
		websiteId: "site-1",
		organizationId: "org-1",
		createdAt: "2026-02-24T01:00:00.000Z",
		updatedAt: "2026-02-24T01:00:00.000Z",
	},
})) as (...args: unknown[]) => Promise<unknown>);
const identifyContactMock = mock((async () => ({
	id: "contact-1",
	externalId: "user-123",
	websiteId: "site-1",
	organizationId: "org-1",
	createdAt: "2026-02-24T01:00:00.000Z",
	updatedAt: "2026-02-24T01:00:00.000Z",
})) as (...args: unknown[]) => Promise<unknown>);
const linkVisitorToContactMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
const findVisitorForWebsiteMock = mock((async () => ({ id: "visitor-1" })) as (
	...args: unknown[]
) => Promise<unknown>);
const getCompleteVisitorWithContactMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const formatContactResponseMock = mock((record: unknown) => record);
const formatVisitorWithContactResponseMock = mock((record: unknown) => record);
const realtimeEmitMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries/contact", () => ({
	createContact: createContactMock,
	createContactOrganization: mock(
		(async () => null) as (...args: unknown[]) => Promise<null>
	),
	deleteContact: mock(
		(async () => null) as (...args: unknown[]) => Promise<null>
	),
	deleteContactOrganization: mock(
		(async () => null) as (...args: unknown[]) => Promise<null>
	),
	findContactForWebsite: mock(
		(async () => null) as (...args: unknown[]) => Promise<null>
	),
	findContactOrganizationForWebsite: mock(
		(async () => null) as (...args: unknown[]) => Promise<null>
	),
	identifyContact: identifyContactMock,
	linkVisitorToContact: linkVisitorToContactMock,
	mergeContactMetadata: mock(
		(async () => null) as (...args: unknown[]) => Promise<null>
	),
	upsertContactByExternalId: upsertContactByExternalIdMock,
	updateContact: mock(
		(async () => null) as (...args: unknown[]) => Promise<null>
	),
	updateContactOrganization: mock(
		(async () => null) as (...args: unknown[]) => Promise<null>
	),
}));

mock.module("@api/db/queries/visitor", () => ({
	findVisitorForWebsite: findVisitorForWebsiteMock,
	getCompleteVisitorWithContact: getCompleteVisitorWithContactMock,
}));

mock.module("@api/utils/format-visitor", () => ({
	formatContactResponse: formatContactResponseMock,
	formatVisitorWithContactResponse: formatVisitorWithContactResponseMock,
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
	protectedPrivateApiKeyMiddleware: [],
}));

const contactRouterModulePromise = import("./contact");

describe("contact identify route", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		validateResponseMock.mockReset();
		createContactMock.mockReset();
		upsertContactByExternalIdMock.mockReset();
		identifyContactMock.mockReset();
		linkVisitorToContactMock.mockReset();
		findVisitorForWebsiteMock.mockReset();
		getCompleteVisitorWithContactMock.mockReset();
		formatContactResponseMock.mockReset();
		formatVisitorWithContactResponseMock.mockReset();
		realtimeEmitMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		createContactMock.mockResolvedValue({
			id: "contact-created",
			externalId: null,
			websiteId: "site-1",
			organizationId: "org-1",
			createdAt: "2026-02-24T01:00:00.000Z",
			updatedAt: "2026-02-24T01:00:00.000Z",
		});
		upsertContactByExternalIdMock.mockResolvedValue({
			status: "created",
			contact: {
				id: "contact-upserted",
				externalId: "user-123",
				websiteId: "site-1",
				organizationId: "org-1",
				createdAt: "2026-02-24T01:00:00.000Z",
				updatedAt: "2026-02-24T01:00:00.000Z",
			},
		});
		identifyContactMock.mockResolvedValue({
			id: "contact-1",
			externalId: "user-123",
			websiteId: "site-1",
			organizationId: "org-1",
			createdAt: "2026-02-24T01:00:00.000Z",
			updatedAt: "2026-02-24T01:00:00.000Z",
		});
		linkVisitorToContactMock.mockResolvedValue(undefined);
		findVisitorForWebsiteMock.mockResolvedValue({ id: "visitor-1" });
		getCompleteVisitorWithContactMock.mockResolvedValue(null);
		formatContactResponseMock.mockImplementation((record) => record);
		formatVisitorWithContactResponseMock.mockImplementation((record) => record);
		realtimeEmitMock.mockResolvedValue(undefined);
	});

	it("returns 400 BAD_REQUEST when both externalId and email are missing", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: {
				id: "site-1",
				organizationId: "org-1",
			},
			body: {
				visitorId: "visitor-1",
				externalId: "   ",
				email: undefined,
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/identify", {
				method: "POST",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			error: "BAD_REQUEST",
			message: "Either externalId or email is required",
		});
		expect(findVisitorForWebsiteMock).toHaveBeenCalledTimes(0);
		expect(identifyContactMock).toHaveBeenCalledTimes(0);
	});

	it("returns 200 and forwards a trimmed externalId to identifyContact", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: {
				id: "site-1",
				organizationId: "org-1",
			},
			body: {
				visitorId: "visitor-1",
				externalId: "  user-123  ",
				email: undefined,
				name: "User",
				image: undefined,
				metadata: undefined,
				contactOrganizationId: undefined,
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/identify", {
				method: "POST",
			})
		);

		expect(response.status).toBe(200);
		expect(identifyContactMock).toHaveBeenCalledTimes(1);

		const identifyArg = identifyContactMock.mock.calls[0]?.[1] as {
			externalId?: string;
			email?: string;
		};
		expect(identifyArg.externalId).toBe("user-123");
		expect(identifyArg.email).toBeUndefined();
	});

	it("returns 200 when visitorId is provided via X-Visitor-Id header", async () => {
		const db = {};
		safelyExtractRequestDataMock.mockResolvedValue({
			db,
			website: {
				id: "site-1",
				organizationId: "org-1",
			},
			visitorIdHeader: "visitor-header-1",
			body: {
				externalId: "user-123",
				email: undefined,
				name: "User",
				image: undefined,
				metadata: undefined,
				contactOrganizationId: undefined,
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/identify", {
				method: "POST",
			})
		);
		const payload = (await response.json()) as {
			visitorId: string;
		};

		expect(response.status).toBe(200);
		expect(findVisitorForWebsiteMock).toHaveBeenCalledWith(db, {
			visitorId: "visitor-header-1",
			websiteId: "site-1",
		});
		expect(linkVisitorToContactMock).toHaveBeenCalledWith(db, {
			visitorId: "visitor-header-1",
			contactId: "contact-1",
			websiteId: "site-1",
		});
		expect(payload.visitorId).toBe("visitor-header-1");
	});

	it("prefers body visitorId over X-Visitor-Id header when both are provided", async () => {
		const db = {};
		safelyExtractRequestDataMock.mockResolvedValue({
			db,
			website: {
				id: "site-1",
				organizationId: "org-1",
			},
			visitorIdHeader: "visitor-header-1",
			body: {
				visitorId: "visitor-body-1",
				externalId: "user-123",
				email: undefined,
				name: "User",
				image: undefined,
				metadata: undefined,
				contactOrganizationId: undefined,
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/identify", {
				method: "POST",
			})
		);
		const payload = (await response.json()) as {
			visitorId: string;
		};

		expect(response.status).toBe(200);
		expect(findVisitorForWebsiteMock).toHaveBeenCalledWith(db, {
			visitorId: "visitor-body-1",
			websiteId: "site-1",
		});
		expect(linkVisitorToContactMock).toHaveBeenCalledWith(db, {
			visitorId: "visitor-body-1",
			contactId: "contact-1",
			websiteId: "site-1",
		});
		expect(payload.visitorId).toBe("visitor-body-1");
	});

	it("returns 400 when neither body nor header provides a visitorId", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: {
				id: "site-1",
				organizationId: "org-1",
			},
			visitorIdHeader: null,
			body: {
				externalId: "user-123",
				email: undefined,
				name: "User",
				image: undefined,
				metadata: undefined,
				contactOrganizationId: undefined,
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/identify", {
				method: "POST",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			error: "BAD_REQUEST",
			message: "Visitor not found, please pass a valid visitorId",
		});
		expect(findVisitorForWebsiteMock).toHaveBeenCalledTimes(0);
		expect(identifyContactMock).toHaveBeenCalledTimes(0);
	});

	it("POST /contacts returns 201 when externalId upsert creates a new contact", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
			},
			body: {
				externalId: "  user-123  ",
				email: "user@example.com",
				name: "User",
				image: undefined,
				metadata: undefined,
				contactOrganizationId: undefined,
			},
		});
		upsertContactByExternalIdMock.mockResolvedValue({
			status: "created",
			contact: {
				id: "contact-created",
				externalId: "user-123",
				websiteId: "site-1",
				organizationId: "org-1",
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		expect(response.status).toBe(201);
		expect(upsertContactByExternalIdMock).toHaveBeenCalledTimes(1);
		expect(createContactMock).toHaveBeenCalledTimes(0);

		const upsertArg = upsertContactByExternalIdMock.mock.calls[0]?.[1] as {
			externalId: string;
		};
		expect(upsertArg.externalId).toBe("user-123");
	});

	it("POST /contacts returns 200 when externalId upsert updates an existing contact", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
			},
			body: {
				externalId: "user-123",
				email: "updated@example.com",
				name: "Updated User",
			},
		});
		upsertContactByExternalIdMock.mockResolvedValue({
			status: "updated",
			contact: {
				id: "contact-existing",
				externalId: "user-123",
				websiteId: "site-1",
				organizationId: "org-1",
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		expect(response.status).toBe(200);
		expect(upsertContactByExternalIdMock).toHaveBeenCalledTimes(1);
		expect(createContactMock).toHaveBeenCalledTimes(0);
	});

	it("POST /contacts keeps create-only behavior when externalId is not provided", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			apiKey: { keyType: APIKeyType.PRIVATE },
			organization: { id: "org-1" },
			website: {
				id: "site-1",
				organizationId: "org-1",
			},
			body: {
				email: "no-external-id@example.com",
				name: "No External ID",
			},
		});

		const { contactRouter } = await contactRouterModulePromise;
		const response = await contactRouter.request(
			new Request("http://localhost/", {
				method: "POST",
			})
		);

		expect(response.status).toBe(201);
		expect(upsertContactByExternalIdMock).toHaveBeenCalledTimes(0);
		expect(createContactMock).toHaveBeenCalledTimes(1);
	});
});
