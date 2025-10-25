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
} from "../events";
import type { ClientStatus, ConnectionConfig, WebSocketClient } from "../types";

const CHANNEL_PREFIX = "cossistant-ws";
const HEARTBEAT_INTERVAL = 2500;
const HEARTBEAT_STALE_MS = HEARTBEAT_INTERVAL * 3;
const BACKOFF_BASE_MS = 500;
const PING_FAILURE_THRESHOLD = 2;
const AUTH_CLOSE_CODES = new Set([4001, 4401, 4403, 4003]);

type PendingSend = {
	readonly resolve: () => void;
	readonly reject: (error: Error) => void;
};

type LeaderPendingSend = {
	readonly requestId: string;
	readonly event: OutEvent;
	readonly originId: string;
};

const ChannelSchema = z.discriminatedUnion("op", [
	z.object({ op: z.literal("announce"), id: z.string(), ts: z.number() }),
	z.object({ op: z.literal("leader"), id: z.string(), ts: z.number() }),
	z.object({ op: z.literal("heartbeat"), id: z.string(), ts: z.number() }),
	z.object({
		op: z.literal("send"),
		id: z.string(),
		ts: z.number(),
		requestId: z.string(),
		event: z.any(),
	}),
	z.object({
		op: z.literal("ack"),
		id: z.string(),
		ts: z.number(),
		requestId: z.string(),
	}),
	z.object({
		op: z.literal("nack"),
		id: z.string(),
		ts: z.number(),
		requestId: z.string(),
		error: z.object({ code: z.string(), message: z.string() }),
	}),
	z.object({
		op: z.literal("event"),
		id: z.string(),
		ts: z.number(),
		event: z.custom<InEvent>(),
	}),
	z.object({
		op: z.literal("unknown"),
		id: z.string(),
		ts: z.number(),
		envelope: z.custom<RawEnvelope>(),
		error: z.custom<ParseError>(),
	}),
	z.object({
		op: z.literal("status"),
		id: z.string(),
		ts: z.number(),
		status: z.object({
			state: z.enum(["connecting", "open", "closed", "waiting"]),
			attempts: z.number(),
			since: z.number(),
			queueSize: z.number(),
			dropped: z.number(),
		}),
	}),
]);

type ChannelMessage = z.infer<typeof ChannelSchema>;

export type LeaderClient = WebSocketClient;

function hashChannel(wsUrl: string): string {
	let hash = 0;
	for (let i = 0; i < wsUrl.length; i += 1) {
		hash = (hash * 31 + wsUrl.charCodeAt(i)) | 0;
	}
	return `${CHANNEL_PREFIX}:${hash.toString(16)}`;
}

function now(): number {
	return Date.now();
}

class LeaderConnection implements LeaderClient {
	private readonly id = `${now()}-${Math.random().toString(16).slice(2)}`;
	private readonly config: Required<ConnectionConfig>;
	private readonly channel: BroadcastChannel;
	private readonly knownIds = new Map<string, number>();
	private readonly pending = new Map<string, PendingSend>();
	private readonly outboundQueue: DroppingQueue<LeaderPendingSend>;
	private socket: WebSocket | null = null;
	private isLeader = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private missedPongs = 0;
	private statusSnapshot: ClientStatus = {
		state: "connecting",
		attempts: 0,
		since: now(),
		queueSize: 0,
		dropped: 0,
	};
	private readonly listeners = new Map<
		InEvent["type"],
		Set<(event: InEvent) => void>
	>();
	private readonly allListeners = new Set<(event: InEvent) => void>();
	private readonly statusListeners = new Set<(status: ClientStatus) => void>();
	private readonly onlineHandler = () => this.handleOnline();
	private readonly offlineHandler = () => this.handleOffline();
	private readonly visibilityHandler = () => this.resetHeartbeat();
	private requestCounter = 0;
	private stopped = false;
	private readonly input: ConnectionConfig;

	constructor(input: ConnectionConfig) {
		if (typeof BroadcastChannel === "undefined") {
			throw new Error("BroadcastChannel is required for leader fallback");
		}
		this.input = input;
		this.config = {
			...input,
			heartbeatMs: input.heartbeatMs ?? 25_000,
			maxQueue: input.maxQueue ?? 100,
			maxBackoffMs: Math.min(input.maxBackoffMs ?? 30_000, 30_000),
			maxQueueDropWarnThreshold:
				input.maxQueueDropWarnThreshold ??
				Math.floor((input.maxQueue ?? 100) * 0.8),
			onUnknown: input.onUnknown ?? (() => {}),
			debug: input.debug ?? false,
		};
		this.channel = new BroadcastChannel(hashChannel(this.config.wsUrl));
		this.channel.addEventListener("message", (event) => {
			this.handleChannelMessage(event.data);
		});
		this.outboundQueue = new DroppingQueue<LeaderPendingSend>(
			this.config.maxQueue
		);
		this.knownIds.set(this.id, now());
		this.sendChannel({ op: "announce", id: this.id, ts: now() });
		if (typeof window !== "undefined") {
			window.addEventListener("online", this.onlineHandler);
			window.addEventListener("offline", this.offlineHandler);
			if (typeof document !== "undefined") {
				document.addEventListener("visibilitychange", this.visibilityHandler);
			}
		}
		this.evaluateLeadership();
	}

	send<T extends OutEvent>(event: T): Promise<void> {
		if (this.stopped) {
			return Promise.reject(new Error("Connection stopped"));
		}
		const validation = parseOutbound(event);
		if (!validation.ok) {
			return Promise.reject(new Error(validation.error.message));
		}
		const requestId = `req-${now()}-${this.requestCounter++}`;
		return new Promise<void>((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			if (this.isLeader) {
				this.enqueueForLeader({
					requestId,
					event: validation.value,
					originId: this.id,
				});
				this.flushQueue();
			} else {
				this.sendChannel({
					op: "send",
					id: this.id,
					ts: now(),
					requestId,
					event: validation.value,
				});
			}
		});
	}

	subscribe<E extends InEvent["type"]>(
		type: E,
		handler: (event: Extract<InEvent, { type: E }>) => void
	): () => void {
		const set = this.listeners.get(type) ?? new Set<(event: InEvent) => void>();
		set.add(handler as unknown as (incoming: InEvent) => void);
		this.listeners.set(type, set);
		return () => {
			set.delete(handler as unknown as (incoming: InEvent) => void);
			if (set.size === 0) {
				this.listeners.delete(type);
			}
		};
	}

	subscribeAll(handler: (event: InEvent) => void): () => void {
		this.allListeners.add(handler);
		return () => {
			this.allListeners.delete(handler);
		};
	}

	subscribeStatus(handler: (status: ClientStatus) => void): () => void {
		this.statusListeners.add(handler);
		handler(this.status());
		return () => {
			this.statusListeners.delete(handler);
		};
	}

	status(): ClientStatus {
		return { ...this.statusSnapshot };
	}

	stop(): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.channel.close();
		if (typeof window !== "undefined") {
			window.removeEventListener("online", this.onlineHandler);
			window.removeEventListener("offline", this.offlineHandler);
			if (typeof document !== "undefined") {
				document.removeEventListener(
					"visibilitychange",
					this.visibilityHandler
				);
			}
		}
		this.teardownSocket(1000, "Client stop");
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		for (const [, pending] of this.pending) {
			pending.reject(new Error("Connection stopped"));
		}
		this.pending.clear();
		this.statusListeners.clear();
	}

	private handleOnline(): void {
		if (this.isLeader) {
			this.connect();
		}
	}

	private handleOffline(): void {
		if (this.isLeader) {
			this.updateStatus({ state: "waiting" });
		}
	}

	private resetHeartbeat(): void {
		if (this.isLeader) {
			this.missedPongs = 0;
		}
	}

	private enqueueForLeader(entry: LeaderPendingSend): void {
		const result = this.outboundQueue.push(entry);
		if (result.dropped && result.droppedValue) {
			this.sendChannel({
				op: "nack",
				id: this.id,
				ts: now(),
				requestId: result.droppedValue.requestId,
				error: {
					code: "queue_full",
					message: "Outbound queue full; message dropped",
				},
			});
		}
		this.updateStatus({
			queueSize: this.outboundQueue.size(),
			dropped: this.outboundQueue.droppedCount(),
		});
	}

	private flushQueue(): void {
		if (
			!(this.isLeader && this.socket) ||
			this.socket.readyState !== WebSocket.OPEN
		) {
			return;
		}
		let next: LeaderPendingSend | undefined = this.outboundQueue.shift();
		while (next) {
			this.sendEnvelope(next);
			next = this.outboundQueue.shift();
		}
		this.updateStatus({ queueSize: this.outboundQueue.size() });
	}

	private sendEnvelope(entry: LeaderPendingSend): void {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			this.enqueueForLeader(entry);
			return;
		}
		try {
			this.socket.send(JSON.stringify(entry.event));
			if (entry.originId === this.id) {
				const pending = this.pending.get(entry.requestId);
				pending?.resolve();
				if (pending) {
					this.pending.delete(entry.requestId);
				}
			} else {
				this.sendChannel({
					op: "ack",
					id: this.id,
					ts: now(),
					requestId: entry.requestId,
				});
			}
		} catch (error) {
			const message = {
				op: "nack" as const,
				id: this.id,
				ts: now(),
				requestId: entry.requestId,
				error: { code: "send_failed", message: (error as Error).message },
			};
			if (entry.originId === this.id) {
				this.pending
					.get(entry.requestId)
					?.reject(new Error(message.error.message));
				this.pending.delete(entry.requestId);
			} else {
				this.sendChannel(message);
			}
		}
	}

	private connect(): void {
		if (!this.isLeader || this.stopped) {
			return;
		}
		if (
			this.socket &&
			(this.socket.readyState === WebSocket.OPEN ||
				this.socket.readyState === WebSocket.CONNECTING)
		) {
			return;
		}
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			this.updateStatus({ state: "waiting" });
			return;
		}
		const attempts =
			this.statusSnapshot.attempts === 0 ? 1 : this.statusSnapshot.attempts;
		this.updateStatus({ state: "connecting", attempts, since: now() });
		this.input
			.requestToken()
			.then((token) => {
				const url = new URL(this.config.wsUrl);
				url.searchParams.set("token", token);
				this.socket = new WebSocket(url.toString(), "json.v1");
				this.socket.addEventListener("open", this.handleOpen);
				this.socket.addEventListener("close", this.handleClose);
				this.socket.addEventListener("error", this.handleError);
				this.socket.addEventListener("message", this.handleMessage);
			})
			.catch((error) => {
				this.scheduleReconnect("token", error.message);
			});
	}

	private teardownSocket(code: number, reason: string): void {
		if (this.socket) {
			this.socket.removeEventListener("open", this.handleOpen);
			this.socket.removeEventListener("close", this.handleClose);
			this.socket.removeEventListener("error", this.handleError);
			this.socket.removeEventListener("message", this.handleMessage);
			try {
				this.socket.close(code, reason);
			} catch (error) {
				if (this.config.debug) {
					console.error("[leader] failed to close socket", error);
				}
			}
		}
		this.socket = null;
		this.stopHeartbeat();
	}

	private handleOpen = (): void => {
		this.missedPongs = 0;
		this.updateStatus({ state: "open", attempts: 0, since: now() });
		this.flushQueue();
		this.startHeartbeat();
	};

	private handleClose = (event: CloseEvent): void => {
		this.stopHeartbeat();
		if (AUTH_CLOSE_CODES.has(event.code)) {
			this.scheduleReconnect("auth", event.reason);
			return;
		}
		if (event.wasClean && event.code === 1000) {
			this.updateStatus({ state: "closed", attempts: 0, since: now() });
			return;
		}
		this.scheduleReconnect(`close_${event.code}`, event.reason);
	};

	private handleError = (event: Event): void => {
		if (this.config.debug) {
			console.error("[leader] socket error", event);
		}
	};

	private handleMessage = (event: MessageEvent): void => {
		this.missedPongs = 0;
		let data: unknown;
		try {
			data = JSON.parse(event.data as string);
		} catch (error) {
			if (this.config.debug) {
				console.warn("[leader] invalid JSON", error);
			}
			return;
		}
		const parsed = parseInbound(data);
		if (!parsed.ok) {
			const raw = data as RawEnvelope;
			const migrated = migrateUnknown(raw);
			if (migrated) {
				this.broadcastEvent(migrated);
				return;
			}
			this.sendChannel({
				op: "unknown",
				id: this.id,
				ts: now(),
				envelope: raw,
				error: parsed,
			});
			this.config.onUnknown(raw, parsed.error);
			return;
		}
		if (parsed.value.type === "pong") {
			this.missedPongs = 0;
		}
		this.broadcastEvent(parsed.value);
	};

	private broadcastEvent(event: InEvent): void {
		this.sendChannel({ op: "event", id: this.id, ts: now(), event });
		for (const subscriber of this.allListeners) {
			subscriber(event);
		}
		const set = this.listeners.get(event.type);
		if (set) {
			for (const subscriber of set) {
				(subscriber as (incoming: InEvent) => void)(event);
			}
		}
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
				return;
			}
			if (this.missedPongs >= PING_FAILURE_THRESHOLD) {
				this.socket.close(4000, "Heartbeat timeout");
				return;
			}
			const ping: OutEvent = {
				v: ENVELOPE_VERSION,
				type: "ping",
				ts: now(),
				id: `${now()}-${Math.random().toString(16).slice(2)}`,
				payload: { sequence: this.missedPongs + 1 },
			};
			this.sendEnvelope({
				requestId: `heartbeat-${now()}`,
				event: ping,
				originId: this.id,
			});
			this.missedPongs += 1;
		}, this.config.heartbeatMs);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private scheduleReconnect(reason: string, detail?: string): void {
		if (!this.isLeader) {
			return;
		}
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}
		const attempt = this.statusSnapshot.attempts + 1;
		const delay = computeBackoffDelay(
			attempt,
			BACKOFF_BASE_MS,
			this.config.maxBackoffMs
		);
		this.updateStatus({ state: "waiting", attempts: attempt, since: now() });
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
		if (this.config.debug) {
			console.info("[leader] scheduling reconnect", { reason, detail, delay });
		}
	}

	private updateStatus(partial: Partial<ClientStatus>): void {
		this.statusSnapshot = {
			...this.statusSnapshot,
			...partial,
		};
		if (this.isLeader) {
			this.sendChannel({
				op: "status",
				id: this.id,
				ts: now(),
				status: this.statusSnapshot,
			});
		}
		for (const listener of this.statusListeners) {
			listener({ ...this.statusSnapshot });
		}
	}

	private sendChannel(message: ChannelMessage): void {
		this.channel.postMessage(message);
	}

	private handleChannelMessage(data: unknown): void {
		const parsed = ChannelSchema.safeParse(data);
		if (!parsed.success) {
			return;
		}
		const message = parsed.data;
		if (message.id === this.id) {
			return;
		}
		this.knownIds.set(message.id, message.ts);
		switch (message.op) {
			case "announce":
			case "leader":
			case "heartbeat":
				this.evaluateLeadership();
				break;
			case "send": {
				if (this.isLeader) {
					const validation = parseOutbound(message.event);
					if (!validation.ok) {
						this.sendChannel({
							op: "nack",
							id: this.id,
							ts: now(),
							requestId: message.requestId,
							error: {
								code: validation.error.code,
								message: validation.error.message,
							},
						});
						return;
					}
					this.enqueueForLeader({
						requestId: message.requestId,
						event: validation.value,
						originId: message.id,
					});
					this.flushQueue();
				}
				break;
			}
			case "ack": {
				const pending = this.pending.get(message.requestId);
				if (pending) {
					pending.resolve();
					this.pending.delete(message.requestId);
				}
				break;
			}
			case "nack": {
				const pending = this.pending.get(message.requestId);
				if (pending) {
					pending.reject(new Error(message.error.message));
					this.pending.delete(message.requestId);
				}
				break;
			}
			case "event": {
				for (const subscriber of this.allListeners) {
					subscriber(message.event);
				}
				const set = this.listeners.get(message.event.type);
				if (set) {
					for (const subscriber of set) {
						(subscriber as (incoming: InEvent) => void)(message.event);
					}
				}
				break;
			}
			case "unknown": {
				this.input.onUnknown?.(message.envelope, message.error);
				break;
			}
			case "status": {
				this.statusSnapshot = message.status;
				break;
			}
			default: {
				break;
			}
		}
	}

	private evaluateLeadership(): void {
		const timestamp = now();
		this.knownIds.set(this.id, timestamp);
		for (const [peerId, lastSeen] of this.knownIds) {
			if (peerId !== this.id && timestamp - lastSeen > HEARTBEAT_STALE_MS) {
				this.knownIds.delete(peerId);
			}
		}
		const highest = [...this.knownIds.keys()].sort().pop() ?? this.id;
		const shouldLead = highest === this.id;
		if (shouldLead && !this.isLeader) {
			this.becomeLeader();
		} else if (!shouldLead && this.isLeader) {
			this.resignLeader();
		}
		if (this.isLeader) {
			this.sendChannel({ op: "leader", id: this.id, ts: now() });
			this.sendChannel({ op: "heartbeat", id: this.id, ts: now() });
		}
	}

	private becomeLeader(): void {
		this.isLeader = true;
		this.connect();
		this.updateStatus({ state: "connecting", attempts: 1, since: now() });
		this.flushQueue();
	}

	private resignLeader(): void {
		this.isLeader = false;
		this.teardownSocket(1000, "leader resign");
		this.updateStatus({ state: "waiting" });
	}
}

export function createLeaderConnection(config: ConnectionConfig): LeaderClient {
	return new LeaderConnection(config);
}
