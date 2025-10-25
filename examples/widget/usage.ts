"use client";

import { useCallback } from "react";
import {
	getConnection,
	type WebSocketClient,
} from "../../packages/core/client";
import type { OutEvent } from "../../packages/core/events";
import { useWebSockets } from "../../packages/react/use-web-sockets";

let widgetClient: WebSocketClient | null = null;

async function fetchWidgetToken(): Promise<string> {
	const response = await fetch(
		"https://support.cossistant.dev/api/widget/token",
		{
			method: "POST",
			credentials: "include",
		}
	);
	if (!response.ok) {
		throw new Error("Failed to obtain widget token");
	}
	const { token } = (await response.json()) as { token: string };
	return token;
}

function ensureWidgetClient(): WebSocketClient {
	if (typeof window === "undefined") {
		throw new Error("Support widget realtime client requires the browser");
	}
	if (!widgetClient) {
		widgetClient = getConnection({
			workerUrl: new URL("../../packages/core/worker.ts", import.meta.url),
			wsUrl: "wss://support.cossistant.dev/ws/widget",
			requestToken: fetchWidgetToken,
			maxQueue: 100,
			maxBackoffMs: 30_000,
			heartbeatMs: 25_000,
		});
	}
	return widgetClient;
}

export function useSupportWidget(): {
	readonly status: ReturnType<WebSocketClient["status"]>;
	readonly send: (event: OutEvent) => Promise<void>;
} {
	const client = ensureWidgetClient();
	const status = useWebSockets(client, {
		selector: (snapshot) => snapshot.status,
	});
	const send = useCallback(
		async (event: OutEvent) => {
			await client.send(event);
		},
		[client]
	);
	return { status, send };
}
