import { beforeEach, describe, expect, it, mock } from "bun:test";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);

const findVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const updateVisitorForWebsiteMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const trackVisitorEventMock = mock((() => {}) as (...args: unknown[]) => void);

const getContactForVisitorMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const mergeContactMetadataMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries/visitor", () => ({
	findVisitorForWebsite: findVisitorForWebsiteMock,
	updateVisitorForWebsite: updateVisitorForWebsiteMock,
}));

mock.module("@api/db/queries/contact", () => ({
	getContactForVisitor: getContactForVisitorMock,
	mergeContactMetadata: mergeContactMetadataMock,
}));

mock.module("@api/lib/tinybird-sdk", () => ({
	trackVisitorEvent: trackVisitorEventMock,
}));

mock.module("../middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
}));

const visitorRouterModulePromise = import("./visitor");

function createVisitorRecord(
	overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
	return {
		id: "visitor-1",
		browser: null,
		browserVersion: null,
		os: null,
		osVersion: null,
		device: null,
		deviceType: null,
		ip: null,
		city: null,
		region: null,
		country: null,
		countryCode: null,
		latitude: null,
		longitude: null,
		language: null,
		timezone: null,
		screenResolution: null,
		viewport: null,
		contactId: null,
		organizationId: "org-1",
		websiteId: "site-1",
		userId: null,
		isTest: false,
		blockedAt: null,
		blockedByUserId: null,
		lastSeenAt: "2026-03-03T00:00:00.000Z",
		createdAt: "2026-03-03T00:00:00.000Z",
		updatedAt: "2026-03-03T00:00:00.000Z",
		deletedAt: null,
		attribution: null,
		currentPage: null,
		...overrides,
	};
}

describe("visitor route PATCH /:id countryCode handling", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		validateResponseMock.mockReset();
		findVisitorForWebsiteMock.mockReset();
		updateVisitorForWebsiteMock.mockReset();
		getContactForVisitorMock.mockReset();
		mergeContactMetadataMock.mockReset();
		trackVisitorEventMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		findVisitorForWebsiteMock.mockResolvedValue(createVisitorRecord());
		updateVisitorForWebsiteMock.mockResolvedValue(createVisitorRecord());
		getContactForVisitorMock.mockResolvedValue(null);
		mergeContactMetadataMock.mockResolvedValue();
	});

	it("does not persist locale macro-region values like es-419 as countryCode", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				language: "es-419",
				timezone: "America/Cancun",
				city: "Cancun",
			},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
				headers: {
					"accept-language": "es-419",
				},
			})
		);

		expect(response.status).toBe(200);
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(1);

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: { countryCode?: string };
		};
		expect(updateArg.data.countryCode).toBeUndefined();
	});

	it("returns 400 when body countryCode is invalid", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				countryCode: "419",
			},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
			})
		);

		const payload = (await response.json()) as {
			error: string;
			message: string;
		};

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			error: "BAD_REQUEST",
			message: "countryCode must be a valid ISO 3166-1 alpha-2 code",
		});
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(0);
	});

	it("normalizes valid body countryCode to uppercase alpha-2", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				countryCode: "mx",
			},
		});
		updateVisitorForWebsiteMock.mockResolvedValue(
			createVisitorRecord({ countryCode: "MX" })
		);

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
			})
		);

		expect(response.status).toBe(200);
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(1);

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: { countryCode?: string };
		};
		expect(updateArg.data.countryCode).toBe("MX");
	});

	it("preserves first-touch attribution while updating current page and tracks page views", async () => {
		const existingAttribution = {
			version: 1 as const,
			firstTouch: {
				channel: "referral" as const,
				isDirect: false,
				referrer: {
					url: "https://news.ycombinator.com/item",
					domain: "news.ycombinator.com",
				},
				landing: {
					url: "https://app.example.com/pricing?utm_source=hn",
					path: "/pricing",
					title: "Pricing | Cossistant",
				},
				utm: {
					source: "hn",
					medium: "referral",
					campaign: "launch",
					content: null,
					term: null,
				},
				clickIds: {
					gclid: null,
					gbraid: null,
					wbraid: null,
					fbclid: null,
					msclkid: null,
					ttclid: null,
					li_fat_id: null,
					twclid: null,
				},
				capturedAt: "2026-03-03T00:00:00.000Z",
			},
		};
		const incomingAttribution = {
			version: 1 as const,
			firstTouch: {
				channel: "paid" as const,
				isDirect: false,
				referrer: {
					url: "https://google.com",
					domain: "google.com",
				},
				landing: {
					url: "https://app.example.com/docs?utm_source=google&utm_medium=cpc&gclid=gclid_123",
					path: "/docs",
					title: "Docs | Cossistant",
				},
				utm: {
					source: "google",
					medium: "cpc",
					campaign: "brand",
					content: null,
					term: null,
				},
				clickIds: {
					gclid: "gclid_123",
					gbraid: null,
					wbraid: null,
					fbclid: null,
					msclkid: null,
					ttclid: null,
					li_fat_id: null,
					twclid: null,
				},
				capturedAt: "2026-03-04T00:00:00.000Z",
			},
		};
		const nextCurrentPage = {
			url: "https://app.example.com/docs?utm_source=newsletter",
			path: "/docs",
			title: "Docs | Cossistant",
			referrerUrl: "https://news.ycombinator.com/item",
			updatedAt: "2026-03-05T00:00:00.000Z",
		};

		findVisitorForWebsiteMock.mockResolvedValue(
			createVisitorRecord({
				attribution: existingAttribution,
				currentPage: {
					url: "https://app.example.com/pricing?utm_source=hn",
					path: "/pricing",
					title: "Pricing | Cossistant",
					referrerUrl: "https://news.ycombinator.com/item",
					updatedAt: "2026-03-03T00:00:00.000Z",
				},
			})
		);
		updateVisitorForWebsiteMock.mockImplementation(async (_db, params) =>
			createVisitorRecord({
				attribution: (params as { data: { attribution: unknown } }).data
					.attribution,
				currentPage: (params as { data: { currentPage: unknown } }).data
					.currentPage,
			})
		);
		safelyExtractRequestDataMock.mockResolvedValue({
			db: {},
			website: { id: "site-1" },
			body: {
				attribution: incomingAttribution,
				currentPage: nextCurrentPage,
			},
		});

		const { visitorRouter } = await visitorRouterModulePromise;
		const response = await visitorRouter.request(
			new Request("http://localhost/visitor-1", {
				method: "PATCH",
			})
		);

		expect(response.status).toBe(200);
		expect(updateVisitorForWebsiteMock).toHaveBeenCalledTimes(1);
		expect(trackVisitorEventMock).toHaveBeenCalledTimes(1);

		const updateArg = updateVisitorForWebsiteMock.mock.calls[0]?.[1] as {
			data: {
				attribution: unknown;
				currentPage: unknown;
			};
		};
		expect(updateArg.data.attribution).toEqual(existingAttribution);
		expect(updateArg.data.currentPage).toEqual(nextCurrentPage);
		expect(trackVisitorEventMock.mock.calls[0]?.[0]).toMatchObject({
			website_id: "site-1",
			visitor_id: "visitor-1",
			event_type: "page_view",
			page_url: "https://app.example.com/docs?utm_source=newsletter",
			page_path: "/docs",
			attribution_channel: "referral",
			attribution_referrer_domain: "news.ycombinator.com",
		});
	});
});
