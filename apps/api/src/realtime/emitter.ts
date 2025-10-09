import { type EventContext, routeEvent } from "@api/ws/router";
import {
        sendEventToConnection,
        sendEventToVisitor,
        sendEventToWebsite,
} from "@api/ws/socket";
import { realtime } from "./realtime";
import {
	type RealtimeEvent,
	type RealtimeEventData,
	type RealtimeEventType,
	validateRealtimeEvent,
} from "@cossistant/types/realtime-events";
import type { Context } from "hono";

type EmitOptions = {
	websiteId?: string | null;
	visitorId?: string | null;
	userId?: string | null;
	organizationId?: string | null;
	connectionId?: string | null;
	timestamp?: number;
};

function extractWebsiteId(data: unknown): string | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	if ("websiteId" in data) {
		const value = (data as { websiteId?: unknown }).websiteId;
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	return null;
}

function extractOrganizationId(data: unknown): string | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	if ("organizationId" in data) {
		const value = (data as { organizationId?: unknown }).organizationId;
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	return null;
}

function extractVisitorId(data: unknown): string | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	if ("visitorId" in data) {
		const direct = (data as { visitorId?: unknown }).visitorId;
		if (typeof direct === "string" && direct.length > 0) {
			return direct;
		}
	}

	if ("message" in data) {
		const nested = (data as { message?: { visitorId?: unknown } | null })
			.message?.visitorId;
		if (typeof nested === "string" && nested.length > 0) {
			return nested;
		}
	}

	if ("conversation" in data) {
		const conversation = (
			data as {
				conversation?: { visitorId?: unknown } | null;
			}
		).conversation;

		const visitorId = (conversation as { visitorId?: unknown } | null)
			?.visitorId;
		if (typeof visitorId === "string" && visitorId.length > 0) {
			return visitorId;
		}
	}

	return null;
}

function extractUserId(data: unknown): string | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	if ("userId" in data) {
		const direct = (data as { userId?: unknown }).userId;
		if (typeof direct === "string" && direct.length > 0) {
			return direct;
		}
	}

	return null;
}

export class RealtimeEmitter {
	async emit<TType extends RealtimeEventType>(
		type: TType,
		payload: RealtimeEventData<TType>,
		options: EmitOptions = {}
	): Promise<void> {
		const data = validateRealtimeEvent(type, payload);
		const websiteId = options.websiteId ?? extractWebsiteId(data);
		const organizationId =
			options.organizationId ?? extractOrganizationId(data) ?? null;

		if (!websiteId) {
			throw new Error(
				`Realtime event "${type}" is missing websiteId. Pass it explicitly or include it in the payload.`
			);
		}

		if (!organizationId) {
			throw new Error(
				`Realtime event "${type}" is missing organizationId. Pass it explicitly or include it in the payload.`
			);
		}

                const event: RealtimeEvent<TType> = {
                        type,
                        payload: data,
                        timestamp: options.timestamp ?? Date.now(),
                        websiteId,
			organizationId,
			visitorId: options.visitorId ?? extractVisitorId(data) ?? null,
		};

		const context: EventContext = {
			connectionId: options.connectionId ?? "server",
			websiteId,
			visitorId: event.visitorId ?? undefined,
			userId: options.userId ?? extractUserId(data) ?? undefined,
			organizationId,
			sendToConnection: sendEventToConnection,
                        sendToVisitor: sendEventToVisitor,
                        sendToWebsite: sendEventToWebsite,
                };

                if (event.type === "MESSAGE_CREATED") {
                        try {
                                const channel = realtime.channel(websiteId);

                                await channel.message.created.emit(event);
                        } catch (error) {
                                console.error("[Realtime] Failed to emit realtime event", error);
                        }
                }

                await routeEvent(event, context);
        }
}

const realtimeEmitter = new RealtimeEmitter();

export function getRealtimeEmitter(c: Context): RealtimeEmitter {
	const emitter = c.get("realtime") as RealtimeEmitter | undefined;
	if (!emitter) {
		throw new Error("Realtime emitter is not available on the current context");
	}
	return emitter;
}

export { realtimeEmitter };
