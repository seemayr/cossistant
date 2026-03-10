import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { InboxAnalyticsResponse } from "@cossistant/types";
import { renderToStaticMarkup } from "react-dom/server";

let capturedControllerState: Record<string, unknown> | null = null;

let inboxAnalyticsQueryState = {
	data: null as InboxAnalyticsResponse | null,
	isError: false,
	isFetching: false,
	isLoading: false,
};

let onlineNowQueryState = {
	data: [] as Array<{ entity_id: string; entity_type: string }>,
	isFetching: false,
	isLoading: false,
};

mock.module("@/data/use-inbox-analytics", () => ({
	useInboxAnalytics: () => inboxAnalyticsQueryState,
}));

mock.module("@/data/use-online-now", () => ({
	ONLINE_NOW_QUERY_KEY_PREFIX: ["tinybird", "online-now"] as const,
	getOnlineNowQueryKeyPrefix: (websiteSlug: string) =>
		["tinybird", "online-now", websiteSlug] as const,
	isVisitorOnlineEntity: (entity: { entity_type: string }) =>
		entity.entity_type === "visitor",
	useOnlineNow: () => onlineNowQueryState,
}));

const modulePromise = import("./inbox-analytics");

describe("InboxAnalytics", () => {
	beforeEach(() => {
		capturedControllerState = null;
		inboxAnalyticsQueryState = {
			data: null,
			isError: false,
			isFetching: false,
			isLoading: false,
		};
		onlineNowQueryState = {
			data: [],
			isFetching: false,
			isLoading: false,
		};
	});

	it("keeps live presence fetching separate from historical analytics loading", async () => {
		onlineNowQueryState = {
			data: [
				{ entity_id: "entity_1", entity_type: "visitor" },
				{ entity_id: "entity_2", entity_type: "user" },
				{ entity_id: "entity_3", entity_type: "visitor" },
			],
			isFetching: true,
			isLoading: false,
		};

		const { useInboxAnalyticsController } = await modulePromise;

		function ControllerProbe() {
			capturedControllerState = useInboxAnalyticsController({
				websiteSlug: "acme",
			}) as Record<string, unknown>;
			return null;
		}

		renderToStaticMarkup(<ControllerProbe />);

		expect(capturedControllerState).not.toBeNull();
		expect(capturedControllerState?.isLoading).toBe(false);
		expect(capturedControllerState?.livePresence).toEqual({
			count: 2,
			isFetching: true,
			isLoading: false,
		});
	});
});
