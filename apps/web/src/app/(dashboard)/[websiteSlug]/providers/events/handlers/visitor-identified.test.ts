import { describe, expect, it, mock } from "bun:test";

import { handleVisitorIdentified } from "./visitor-identified";

describe("handleVisitorIdentified", () => {
	it("patches visitor cache and invalidates matching contact/presence queries", () => {
		const setNormalizedDataMock = mock((() => {}) as (value: unknown) => void);
		const setQueryDataMock = mock((() => {}) as (
			queryKey: unknown,
			value: unknown
		) => void);
		const invalidateQueriesMock = mock((async () => {}) as (
			input: unknown
		) => Promise<void>);

		const queryCacheQueries = [
			{
				queryKey: [
					["conversation", "getVisitorById"],
					{ input: { websiteSlug: "acme", visitorId: "visitor-1" } },
				],
			},
			{
				queryKey: [
					["conversation", "getVisitorById"],
					{ input: { websiteSlug: "acme", visitorId: "visitor-2" } },
				],
			},
			{
				queryKey: [
					["conversation", "getVisitorById"],
					{ input: { websiteSlug: "other", visitorId: "visitor-1" } },
				],
			},
			{
				queryKey: [["contact", "list"], { input: { websiteSlug: "acme" } }],
			},
			{
				queryKey: [["contact", "list"], { input: { websiteSlug: "other" } }],
			},
			{
				queryKey: [["contact", "list"], { input: {} }],
			},
			{
				queryKey: [["conversation", "listConversationsHeaders"], { input: {} }],
			},
		] as const;

		const findAllMock = mock(((options?: {
			predicate?: (query: (typeof queryCacheQueries)[number]) => boolean;
		}) => {
			if (options?.predicate) {
				return queryCacheQueries.filter((query) => options.predicate?.(query));
			}
			return queryCacheQueries;
		}) as (options?: unknown) => typeof queryCacheQueries);

		handleVisitorIdentified({
			event: {
				type: "visitorIdentified",
				payload: {
					websiteId: "site-1",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					visitor: {
						id: "visitor-1",
						contact: {
							id: "contact-1",
							name: "Alice",
							email: "alice@example.com",
							image: null,
						},
					},
				},
			} as never,
			context: {
				queryNormalizer: {
					setNormalizedData: setNormalizedDataMock,
				} as never,
				queryClient: {
					getQueryCache: () => ({
						findAll: findAllMock,
					}),
					setQueryData: setQueryDataMock,
					invalidateQueries: invalidateQueriesMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
				userId: "user-1",
			} as never,
		});

		expect(findAllMock).toHaveBeenCalledTimes(2);
		expect(setNormalizedDataMock).toHaveBeenCalledTimes(1);
		expect(setQueryDataMock).toHaveBeenCalledTimes(1);
		expect(setQueryDataMock.mock.calls[0]?.[0]).toEqual([
			["conversation", "getVisitorById"],
			{ input: { websiteSlug: "acme", visitorId: "visitor-1" } },
		]);
		expect(setQueryDataMock.mock.calls[0]?.[1]).toEqual({
			id: "visitor-1",
			contact: {
				id: "contact-1",
				name: "Alice",
				email: "alice@example.com",
				image: null,
			},
		});
		expect(invalidateQueriesMock).toHaveBeenCalledTimes(4);
		expect(invalidateQueriesMock.mock.calls[0]?.[0]).toEqual({
			queryKey: [
				["conversation", "getVisitorById"],
				{ input: { websiteSlug: "acme", visitorId: "visitor-1" } },
			],
			exact: true,
		});
		expect(invalidateQueriesMock.mock.calls[1]?.[0]).toEqual({
			queryKey: [["contact", "list"], { input: { websiteSlug: "acme" } }],
			exact: true,
		});
		expect(invalidateQueriesMock.mock.calls[2]?.[0]).toEqual({
			queryKey: [["contact", "list"], { input: {} }],
			exact: true,
		});
		expect(invalidateQueriesMock.mock.calls[3]?.[0]).toEqual({
			queryKey: ["tinybird", "visitor-presence", "acme"],
		});
	});

	it("ignores events from other websites", () => {
		const setNormalizedDataMock = mock((() => {}) as (value: unknown) => void);
		const setQueryDataMock = mock((() => {}) as (
			queryKey: unknown,
			value: unknown
		) => void);
		const invalidateQueriesMock = mock((async () => {}) as (
			input: unknown
		) => Promise<void>);

		handleVisitorIdentified({
			event: {
				type: "visitorIdentified",
				payload: {
					websiteId: "site-other",
					organizationId: "org-1",
					visitorId: "visitor-1",
					userId: null,
					visitor: {
						id: "visitor-1",
					},
				},
			} as never,
			context: {
				queryNormalizer: {
					setNormalizedData: setNormalizedDataMock,
				} as never,
				queryClient: {
					getQueryCache: () => ({
						findAll: () => [],
					}),
					setQueryData: setQueryDataMock,
					invalidateQueries: invalidateQueriesMock,
				} as never,
				website: {
					id: "site-1",
					slug: "acme",
				},
				userId: "user-1",
			} as never,
		});

		expect(setNormalizedDataMock).toHaveBeenCalledTimes(0);
		expect(setQueryDataMock).toHaveBeenCalledTimes(0);
		expect(invalidateQueriesMock).toHaveBeenCalledTimes(0);
	});
});
