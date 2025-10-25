import { z } from "zod";
import {
	computeBackoffDelay,
	DroppingQueue,
	ENVELOPE_VERSION,
	type InEvent,
	migrateUnknown,
	type OutEvent,
	type ParseError,
	parseInbound,
	parseOutbound,
	type RawEnvelope,
} from "./events";

type WorkerConfig = {
	readonly wsUrl: string;
	readonly heartbeatMs: number;
	readonly maxQueue: number;
	readonly maxBackoffMs: number;
	readonly debug: boolean;
};

type StatusSnapshot = {
	state: "connecting" | "open" | "closed" | "waiting";
	attempts: number;
	since: number;
	queueSize: number;
	dropped: number;
};

type LogLevel = "error" | "warn" | "info" | "debug";

type PendingToken = {
	resolve: (token: string) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

type PendingSend = {
	readonly port?: MessagePort;
	readonly requestId: string;
	readonly event: OutEvent;
};

const DEFAULTS: WorkerConfig = {
	wsUrl: "",
	heartbeatMs: 25_000,
	maxQueue: 100,
	maxBackoffMs: 30_000,
	debug: false,
};

const TOKEN_TIMEOUT_MS = 10_000;
const PING_FAILURE_THRESHOLD = 2;
const BACKOFF_BASE_MS = 500;
const AUTH_CLOSE_CODES = new Set([4001, 4401, 4403, 4003]);

const WorkerPortMessageSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("init"),
		config: z.object({
			wsUrl: z.string().url(),
			heartbeatMs: z.number().int().positive().optional(),
			maxQueue: z.number().int().positive().optional(),
			maxBackoffMs: z.number().int().positive().optional(),
			debug: z.boolean().optional(),
		}),
	}),
	z.object({
		op: z.literal("send"),
		event: z.any(),
		requestId: z.string().min(1),
	}),
	z.object({
		op: z.literal("stop"),
	}),
	z.object({
		op: z.literal("status"),
	}),
	z.object({
		op: z.literal("tokenResponse"),
		requestId: z.string().min(1),
		token: z.string().min(1),
	}),
	z.object({
		op: z.literal("tokenError"),
		requestId: z.string().min(1),
		reason: z.string().min(1),
	}),
	z.object({
		op: z.literal("lifecycle"),
		state: z.enum(["online", "offline", "visible", "hidden"]),
	}),
]);

type WorkerPortMessage = z.infer<typeof WorkerPortMessageSchema>;

type WorkerOutboundEvent = {
	readonly op: "event";
	readonly event: InEvent;
};

type WorkerUnknownEvent = {
	readonly op: "unknown";
	readonly envelope: RawEnvelope;
	readonly error: ParseError;
};

type WorkerAckMessage = {
	readonly op: "ack";
	readonly requestId: string;
};

type WorkerNackMessage = {
	readonly op: "nack";
	readonly requestId: string;
	readonly error: { code: string; message: string };
};

type WorkerStatusMessage = {
	readonly op: "status";
	readonly status: StatusSnapshot;
};

type WorkerTokenRequest = {
	readonly op: "tokenRequest";
	readonly requestId: string;
};

type WorkerLogMessage = {
	readonly op: "log";
	readonly level: LogLevel;
	readonly message: string;
	readonly details?: Record<string, unknown>;
};

type PortOutboundMessage =
	| WorkerOutboundEvent
	| WorkerUnknownEvent
	| WorkerAckMessage
	| WorkerNackMessage
	| WorkerStatusMessage
	| WorkerTokenRequest
	| WorkerLogMessage;

const ports = new Set<MessagePort>();
const portHandlers = new WeakMap<MessagePort, (event: MessageEvent) => void>();
let config: WorkerConfig = DEFAULTS;
let socket: WebSocket | null = null;
let state: StatusSnapshot = {
	state: "closed",
	attempts: 0,
	since: Date.now(),
	queueSize: 0,
	dropped: 0,
};
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let missedPongs = 0;
let lastPingSequence = 0;
let currentTokenPromise: Promise<string> | null = null;
const pendingTokenRequests = new Map<string, PendingToken>();
let outboundQueue = new DroppingQueue<PendingSend>(DEFAULTS.maxQueue);
let isOffline = false;
let visibilityState: "visible" | "hidden" = "visible";

function broadcast(message: PortOutboundMessage): void {
	for (const port of ports) {
		try {
			port.postMessage(message);
		} catch (error) {
			console.error("[ws-worker] failed to postMessage", error);
		}
	}
}

function log(
	level: LogLevel,
	message: string,
	details?: Record<string, unknown>
): void {
	if (level === "error" || config.debug) {
		broadcast({ op: "log", level, message, details });
	}
}

function updateState(partial: Partial<StatusSnapshot>): void {
	state = {
		...state,
		...partial,
		queueSize: outboundQueue.size(),
		dropped: outboundQueue.droppedCount(),
	};
	broadcast({ op: "status", status: state });
}

function stopHeartbeat(): void {
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	}
}

function startHeartbeat(): void {
	stopHeartbeat();
	heartbeatTimer = setInterval(() => {
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			return;
		}
		if (missedPongs >= PING_FAILURE_THRESHOLD) {
			log("warn", "Heartbeat threshold exceeded, closing socket");
			socket.close(4000, "Heartbeat timeout");
			return;
		}
		lastPingSequence += 1;
		const pingEvent: OutEvent = {
			v: ENVELOPE_VERSION,
			type: "ping",
			ts: Date.now(),
			id: `${Date.now()}-${lastPingSequence}`,
			payload: { sequence: lastPingSequence },
		};
		sendNow({
			event: pingEvent,
			requestId: `heartbeat-${lastPingSequence}`,
		});
		missedPongs += 1;
	}, config.heartbeatMs);
}

function clearReconnectTimer(): void {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function scheduleReconnect(reason: string): void {
	if (isOffline) {
		log("info", "Offline detected, postponing reconnect", { reason });
		updateState({ state: "waiting" });
		return;
	}
	clearReconnectTimer();
	const delay = computeBackoffDelay(
		state.attempts + 1,
		BACKOFF_BASE_MS,
		config.maxBackoffMs
	);
	log("info", "Scheduling reconnect", { delay, reason });
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connect();
	}, delay);
	updateState({
		state: "waiting",
		attempts: state.attempts + 1,
		since: Date.now(),
	});
}

function requestToken(): Promise<string> {
	if (currentTokenPromise) {
		return currentTokenPromise;
	}
	const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	broadcast({ op: "tokenRequest", requestId });
	currentTokenPromise = new Promise<string>((resolve, reject) => {
		const timer = setTimeout(() => {
			pendingTokenRequests.delete(requestId);
			reject(new Error("Timed out waiting for token"));
		}, TOKEN_TIMEOUT_MS);
		pendingTokenRequests.set(requestId, {
			resolve: (token) => {
				clearTimeout(timer);
				pendingTokenRequests.delete(requestId);
				resolve(token);
			},
			reject: (err) => {
				clearTimeout(timer);
				pendingTokenRequests.delete(requestId);
				reject(err);
			},
			timer,
		});
	}).finally(() => {
		currentTokenPromise = null;
	});
	return currentTokenPromise;
}

function flushQueue(): void {
	if (!socket || socket.readyState !== WebSocket.OPEN) {
		return;
	}
	let entry: PendingSend | undefined = outboundQueue.shift();
	while (entry) {
		sendNow(entry);
		entry = outboundQueue.shift();
	}
	updateState({ queueSize: outboundQueue.size() });
}

function sendNow(entry: PendingSend): void {
	if (!socket || socket.readyState !== WebSocket.OPEN) {
		const pushResult = outboundQueue.push({
			port: entry.port,
			requestId: entry.requestId,
			event: entry.event,
		});
		if (pushResult.dropped && pushResult.droppedValue) {
			const targetPort = pushResult.droppedValue.port;
			if (targetPort) {
				targetPort.postMessage({
					op: "nack",
					requestId: pushResult.droppedValue.requestId,
					error: {
						code: "queue_full",
						message: "Outbound queue at capacity; oldest entry dropped",
					},
				});
			}
		}
		updateState({ queueSize: outboundQueue.size() });
		return;
	}
	try {
		socket.send(JSON.stringify(entry.event));
		if (entry.port) {
			entry.port.postMessage({ op: "ack", requestId: entry.requestId });
		}
	} catch (error) {
		const port = entry.port;
		if (port) {
			port.postMessage({
				op: "nack",
				requestId: entry.requestId,
				error: { code: "send_failed", message: (error as Error).message },
			});
		}
		outboundQueue.push(entry);
	}
}

function connect(): void {
	if (
		socket &&
		(socket.readyState === WebSocket.OPEN ||
			socket.readyState === WebSocket.CONNECTING)
	) {
		return;
	}
	if (!config.wsUrl) {
		log("error", "Cannot connect without wsUrl");
		return;
	}
	const nextAttempts = state.attempts === 0 ? 1 : state.attempts;
	updateState({
		state: "connecting",
		attempts: nextAttempts,
		since: Date.now(),
	});
	requestToken()
		.then((token) => {
			const url = new URL(config.wsUrl);
			url.searchParams.set("token", token);
			socket = new WebSocket(url.toString(), "json.v1");
			socket.addEventListener("open", handleOpen);
			socket.addEventListener("close", handleClose);
			socket.addEventListener("error", handleError);
			socket.addEventListener("message", handleMessage);
		})
		.catch((error) => {
			log("error", "Failed to obtain token", { message: error.message });
			scheduleReconnect("token_error");
		});
}

function teardownSocket(code = 1000, reason = "Client stop"): void {
	if (socket) {
		socket.removeEventListener("open", handleOpen);
		socket.removeEventListener("close", handleClose);
		socket.removeEventListener("error", handleError);
		socket.removeEventListener("message", handleMessage);
		try {
			socket.close(code, reason);
		} catch (error) {
			log("error", "Error closing socket", {
				message: (error as Error).message,
			});
		}
	}
	socket = null;
	stopHeartbeat();
}

function handleOpen(): void {
	missedPongs = 0;
	updateState({ state: "open", attempts: 0, since: Date.now() });
	flushQueue();
	startHeartbeat();
}

function handleClose(event: CloseEvent): void {
	stopHeartbeat();
	log("info", "Socket closed", { code: event.code, reason: event.reason });
	if (AUTH_CLOSE_CODES.has(event.code)) {
		scheduleReconnect("auth_refresh");
		return;
	}
	if (event.wasClean && event.code === 1000) {
		updateState({ state: "closed", attempts: 0, since: Date.now() });
		return;
	}
	scheduleReconnect(`close_${event.code}`);
}

function handleError(event: Event): void {
	log("error", "Socket error", { message: (event as ErrorEvent).message });
}

function handleMessage(event: MessageEvent): void {
	missedPongs = 0;
	let data: unknown;
	try {
		data = JSON.parse(event.data as string);
	} catch (error) {
		log("warn", "Failed to parse inbound payload", {
			error: (error as Error).message,
		});
		return;
	}
	const parsed = parseInbound(data);
	if (!parsed.ok) {
		const raw = data as RawEnvelope;
		const migrated = migrateUnknown(raw);
		if (migrated) {
			broadcast({ op: "event", event: migrated });
			return;
		}
		broadcast({
			op: "unknown",
			envelope: raw,
			error: parsed,
		});
		return;
	}
	if (parsed.value.type === "pong") {
		missedPongs = 0;
	}
	broadcast({ op: "event", event: parsed.value });
}

function handleTokenResponse(
	message: Extract<WorkerPortMessage, { op: "tokenResponse" }>
): void {
	const pending = pendingTokenRequests.get(message.requestId);
	if (!pending) {
		return;
	}
	pending.resolve(message.token);
}

function handleTokenError(
	message: Extract<WorkerPortMessage, { op: "tokenError" }>
): void {
	const pending = pendingTokenRequests.get(message.requestId);
	if (!pending) {
		return;
	}
	pending.reject(new Error(message.reason));
}

function handleLifecycle(
	message: Extract<WorkerPortMessage, { op: "lifecycle" }>
): void {
	if (message.state === "online") {
		isOffline = false;
		if (!socket || socket.readyState === WebSocket.CLOSED) {
			connect();
		}
	} else if (message.state === "offline") {
		isOffline = true;
		clearReconnectTimer();
		updateState({ state: "waiting" });
	} else {
		visibilityState = message.state;
		if (
			visibilityState === "visible" &&
			socket &&
			socket.readyState === WebSocket.OPEN
		) {
			missedPongs = 0;
		}
	}
}

function handleSend(
	port: MessagePort,
	message: Extract<WorkerPortMessage, { op: "send" }>
): void {
	const parsed = parseOutbound(message.event);
	if (!parsed.ok) {
		port.postMessage({
			op: "nack",
			requestId: message.requestId,
			error: { code: parsed.error.code, message: parsed.error.message },
		});
		return;
	}
	sendNow({ port, requestId: message.requestId, event: parsed.value });
}

function handlePortMessage(port: MessagePort, data: unknown): void {
	const parsed = WorkerPortMessageSchema.safeParse(data);
	if (!parsed.success) {
		log("warn", "Ignoring malformed worker message", {
			issues: parsed.error.issues,
		});
		return;
	}
	switch (parsed.data.op) {
		case "init": {
			const nextConfig: WorkerConfig = {
				wsUrl: parsed.data.config.wsUrl,
				heartbeatMs: parsed.data.config.heartbeatMs ?? DEFAULTS.heartbeatMs,
				maxQueue: parsed.data.config.maxQueue ?? DEFAULTS.maxQueue,
				maxBackoffMs: Math.min(
					parsed.data.config.maxBackoffMs ?? DEFAULTS.maxBackoffMs,
					30_000
				),
				debug: parsed.data.config.debug ?? DEFAULTS.debug,
			};
			const queueNeedsResize = nextConfig.maxQueue !== config.maxQueue;
			config = nextConfig;
			if (queueNeedsResize) {
				const existing = outboundQueue.toArray();
				outboundQueue = new DroppingQueue<PendingSend>(config.maxQueue);
				for (const item of existing.slice(-config.maxQueue)) {
					outboundQueue.push(item);
				}
			}
			updateState({});
			if (!socket || socket.readyState === WebSocket.CLOSED) {
				connect();
			}
			break;
		}
		case "send":
			handleSend(port, parsed.data);
			break;
		case "stop": {
			ports.delete(port);
			const handler = portHandlers.get(port);
			if (handler) {
				port.removeEventListener("message", handler as EventListener);
				portHandlers.delete(port);
			}
			if (ports.size === 0) {
				clearReconnectTimer();
				teardownSocket(1000, "All ports closed");
				outboundQueue.clear();
			}
			break;
		}
		case "status":
			port.postMessage({ op: "status", status: state });
			break;
		case "tokenResponse":
			handleTokenResponse(parsed.data);
			break;
		case "tokenError":
			handleTokenError(parsed.data);
			break;
		case "lifecycle":
			handleLifecycle(parsed.data);
			break;
		default:
			log("warn", "Unhandled worker message op", { op: parsed.data.op });
			break;
	}
}

function onConnect(event: MessageEvent): void {
	const port = event.ports[0];
	if (!port) {
		return;
	}
	if (ports.has(port)) {
		return;
	}
	ports.add(port);
	port.start();
	const handler = (evt: MessageEvent) => handlePortMessage(port, evt.data);
	portHandlers.set(port, handler);
	port.addEventListener("message", handler as EventListener);
	port.postMessage({ op: "status", status: state });
}

if (typeof self !== "undefined" && "addEventListener" in self) {
	(self as unknown as SharedWorkerGlobalScope).addEventListener(
		"connect",
		onConnect as EventListener
	);
}
