import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import { useRealtime } from "./use-realtime";
import { hasEventHandlers, type EventHandlerRecord } from "./utils";

type DashboardRealtimeEvents = {
	message: {
		created: RealtimeEvent<"MESSAGE_CREATED">;
	};
};

export type DashboardRealtimeEventHandlers = EventHandlerRecord<DashboardRealtimeEvents>;

export type UseDashboardRealtimeOptions = {
	websiteId: string | null | undefined;
	endpoint?: string;
	enabled?: boolean;
	events?: DashboardRealtimeEventHandlers;
};

export function useDashboardRealtime({
	websiteId,
	endpoint = "/v1/realtime/dashboard",
	enabled = true,
	events,
}: UseDashboardRealtimeOptions) {
	const hasHandlers = hasEventHandlers<DashboardRealtimeEvents>(events);
	const shouldEnable = enabled && Boolean(websiteId && hasHandlers);

	return useRealtime<DashboardRealtimeEvents>({
		channel: websiteId ?? "default",
		endpoint,
		enabled: shouldEnable,
		params: {
			websiteId: websiteId ?? undefined,
		},
		events: hasHandlers ? events : undefined,
	});
}
