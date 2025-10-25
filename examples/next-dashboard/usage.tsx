"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";
import {
	getConnection,
	type WebSocketClient,
} from "../../packages/core/client";
import type { InEvent } from "../../packages/core/events";
import { useWebSockets } from "../../packages/react/use-web-sockets";

let dashboardClient: WebSocketClient | null = null;

async function requestDashboardToken(): Promise<string> {
	const response = await fetch("/api/auth/realtime", {
		credentials: "include",
	});
	if (!response.ok) {
		throw new Error("Failed to refresh realtime token");
	}
	const data = (await response.json()) as { token: string };
	return data.token;
}

export function getDashboardConnection(): WebSocketClient {
	if (!dashboardClient) {
		dashboardClient = getConnection({
			workerUrl: new URL("../../packages/core/worker.ts", import.meta.url),
			wsUrl: "wss://api.cossistant.dev/ws/dashboard",
			requestToken: requestDashboardToken,
			heartbeatMs: 25_000,
			maxQueue: 200,
			debug: process.env.NODE_ENV === "development",
		});
	}
	return dashboardClient;
}

export function DashboardRealtimeIndicator(): JSX.Element {
	const client = getDashboardConnection();
	const status = useWebSockets(client, {
		selector: (snapshot) => snapshot.status,
	});
	return (
		<div>
			<strong>Socket:</strong> {status.state}
			{" · Queue "}
			{status.queueSize}
			{" · Dropped "}
			{status.dropped}
		</div>
	);
}

export function useConversationFeed(conversationId: string): InEvent[] {
	const client = getDashboardConnection();
	const [events, setEvents] = useState<InEvent[]>([]);
	useEffect(
		() =>
			client.subscribeAll((event) => {
				if (
					"conversationId" in event.payload &&
					event.payload.conversationId === conversationId
				) {
					setEvents((previous) => [...previous.slice(-100), event]);
				}
			}),
		[client, conversationId]
	);
	return events;
}
