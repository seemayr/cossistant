import { beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getOnlineNowQueryKeyPrefix } from "@/data/use-online-now";
import { getVisitorPresenceQueryKeyPrefix } from "@/data/use-visitor-presence";

const invalidateQueriesMock = mock(() => Promise.resolve(undefined));
const useRealtimeMock = mock(
	(config: { events: Record<string, Array<(...args: unknown[]) => void>> }) =>
		config
);

mock.module("@cossistant/next/realtime", () => ({
	useRealtime: useRealtimeMock,
}));

mock.module("@normy/react-query", () => ({
	useQueryNormalizer: () => ({}),
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		mutate: () => {},
	}),
	useQuery: () => ({ data: null }),
	useQueryClient: () => ({
		invalidateQueries: invalidateQueriesMock,
	}),
}));

mock.module("@/components/plan/upgrade-modal", () => ({
	UpgradeModal: () => null,
}));

mock.module("@/contexts/website", () => ({
	useUserSession: () => ({
		user: { id: "user_123" },
	}),
	useWebsite: () => ({
		id: "site_123",
		slug: "acme",
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		aiAgent: {
			get: { queryOptions: () => ({}) },
			getTrainingReadiness: { queryOptions: () => ({}) },
			startTraining: { mutationOptions: () => ({}) },
		},
		plan: {
			getPlanInfo: { queryOptions: () => ({}) },
		},
	}),
}));

const modulePromise = import("./realtime");

describe("Realtime presence invalidation", () => {
	beforeEach(() => {
		invalidateQueriesMock.mockClear();
		useRealtimeMock.mockClear();
	});

	it("invalidates visitor presence and online-now queries for presence events", async () => {
		const { Realtime } = await modulePromise;

		renderToStaticMarkup(
			<Realtime>
				<div>child</div>
			</Realtime>
		);

		const realtimeConfig = useRealtimeMock.mock.calls[0]?.[0] as {
			events: Record<string, Array<(...args: unknown[]) => void>>;
		};
		expect(realtimeConfig).toBeTruthy();

		const presenceQueryKey = getVisitorPresenceQueryKeyPrefix("acme");
		const onlineNowQueryKey = getOnlineNowQueryKeyPrefix("acme");
		const eventNames = [
			"userConnected",
			"userDisconnected",
			"visitorConnected",
			"visitorDisconnected",
		] as const;

		for (const eventName of eventNames) {
			invalidateQueriesMock.mockClear();
			const handler = realtimeConfig.events[eventName]?.[0];

			expect(handler).toBeTypeOf("function");
			handler?.(null, {
				context: {},
				event: { payload: {}, type: eventName },
			});

			expect(invalidateQueriesMock.mock.calls as unknown[]).toEqual([
				[{ queryKey: presenceQueryKey }],
				[{ queryKey: onlineNowQueryKey }],
			]);
		}
	});
});
