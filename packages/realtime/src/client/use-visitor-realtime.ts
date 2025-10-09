import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import { useRealtime } from "./use-realtime";
import { hasEventHandlers, type EventHandlerRecord } from "./utils";

type VisitorRealtimeEvents = {
	message: {
		created: RealtimeEvent<"MESSAGE_CREATED">;
	};
};

export type VisitorRealtimeEventHandlers = EventHandlerRecord<VisitorRealtimeEvents>;

export type UseVisitorRealtimeOptions = {
	websiteId: string | null | undefined;
	visitorId: string | null | undefined;
	publicKey: string | null | undefined;
	endpoint?: string;
	enabled?: boolean;
	events?: VisitorRealtimeEventHandlers;
};

export function useVisitorRealtime({
	websiteId,
	visitorId,
	publicKey,
	endpoint = "/v1/realtime/visitor",
	enabled = true,
	events,
}: UseVisitorRealtimeOptions) {
	const hasHandlers = hasEventHandlers<VisitorRealtimeEvents>(events);

	const shouldEnable =
		enabled && Boolean(websiteId && visitorId && publicKey && hasHandlers);

	return useRealtime<VisitorRealtimeEvents>({
		channel: websiteId ?? "default",
		endpoint,
		enabled: shouldEnable,
		params: {
			visitorId: visitorId ?? undefined,
			publicKey: publicKey ?? undefined,
		},
		events: hasHandlers ? events : undefined,
	});
}
