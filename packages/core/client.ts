import { z } from "zod";
import type { InEvent, OutEvent, ParseError, RawEnvelope } from "./events";
import { OutEventSchema, parseOutbound } from "./events";
import { createLeaderConnection, type LeaderClient } from "./fallback/leader";
import type { ClientStatus, ConnectionConfig, WebSocketClient } from "./types";

export type { ClientStatus, ConnectionConfig, WebSocketClient } from "./types";

type PendingSend = {
	readonly resolve: () => void;
	readonly reject: (error: Error) => void;
};

const WorkerEventSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("event"),
		event: z.custom<InEvent>(),
	}),
	z.object({
		op: z.literal("unknown"),
		envelope: z.custom<RawEnvelope>(),
		error: z.custom<ParseError>(),
	}),
	z.object({
		op: z.literal("ack"),
		requestId: z.string(),
	}),
	z.object({
		op: z.literal("nack"),
		requestId: z.string(),
		error: z.object({ code: z.string(), message: z.string() }),
	}),
	z.object({
		op: z.literal("status"),
		status: z.object({
			state: z.enum(["connecting", "open", "closed", "waiting"]),
			attempts: z.number().int().nonnegative(),
			since: z.number().int().nonnegative(),
			queueSize: z.number().int().nonnegative(),
			dropped: z.number().int().nonnegative(),
		}),
	}),
	z.object({
		op: z.literal("tokenRequest"),
		requestId: z.string(),
	}),
	z.object({
		op: z.literal("log"),
		level: z.enum(["error", "warn", "info", "debug"]),
		message: z.string(),
		details: z.record(z.unknown()).optional(),
	}),
]);

const WorkerOutboundSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("init"),
		config: z.object({
			wsUrl: z.string(),
			heartbeatMs: z.number().int().positive(),
			maxQueue: z.number().int().positive(),
			maxBackoffMs: z.number().int().positive(),
			debug: z.boolean(),
		}),
	}),
	z.object({
		op: z.literal("send"),
		event: OutEventSchema,
		requestId: z.string(),
	}),
	z.object({
		op: z.literal("stop"),
	}),
	z.object({
		op: z.literal("status"),
	}),
	z.object({
		op: z.literal("tokenResponse"),
		requestId: z.string(),
		token: z.string(),
	}),
	z.object({
		op: z.literal("tokenError"),
		requestId: z.string(),
		reason: z.string(),
	}),
	z.object({
		op: z.literal("lifecycle"),
		state: z.enum(["online", "offline", "visible", "hidden"]),
	}),
]);

type WorkerInboundMessage = z.infer<typeof WorkerEventSchema>;
type WorkerOutboundMessage = z.infer<typeof WorkerOutboundSchema>;

const DEFAULT_HEARTBEAT = 25_000;
const DEFAULT_QUEUE = 100;
const DEFAULT_BACKOFF = 30_000;

type SharedClient = {
	readonly port: MessagePort;
	readonly worker: SharedWorker;
};

type RegistryEntry = {
	client: WebSocketClient;
	stop: () => void;
};

const registry: Map<string, RegistryEntry> = getRegistry();

function getRegistry(): Map<string, RegistryEntry> {
	const globalKey = "__cossistant_ws_clients__";
	const existing = (globalThis as Record<string, unknown>)[globalKey];
	if (existing && existing instanceof Map) {
		return existing as Map<string, RegistryEntry>;
	}
	const map = new Map<string, RegistryEntry>();
	(globalThis as Record<string, unknown>)[globalKey] = map;
	return map;
}

function assertBrowser(): void {
	if (typeof window === "undefined") {
		throw new Error("WebSocket client must only run in the browser");
	}
}

function makeKey(config: ConnectionConfig): string {
	return `${config.wsUrl}`;
}

class SharedWorkerClient implements WebSocketClient {
	private readonly config: Required<ConnectionConfig>;
	private readonly port: MessagePort;
	private readonly worker: SharedWorker;
	private readonly pending = new Map<string, PendingSend>();
	private readonly typeSubscribers = new Map<
		InEvent["type"],
		Set<(event: InEvent) => void>
	>();
	private readonly allSubscribers = new Set<(event: InEvent) => void>();
	private readonly statusSubscribers = new Set<
		(status: ClientStatus) => void
	>();
	private statusSnapshot: ClientStatus = {
		state: "connecting",
		attempts: 0,
		since: Date.now(),
		queueSize: 0,
		dropped: 0,
	};
	private requestCounter = 0;
	private stopped = false;
	private tokenPromise: Promise<string> | null = null;
	private readonly onlineHandler = () => this.sendLifecycle("online");
	private readonly offlineHandler = () => this.sendLifecycle("offline");
	private readonly visibilityHandler = () =>
		this.sendLifecycle(
			document.visibilityState === "hidden" ? "hidden" : "visible"
		);

	constructor(config: ConnectionConfig, shared: SharedClient) {
		this.config = {
			...config,
			heartbeatMs: config.heartbeatMs ?? DEFAULT_HEARTBEAT,
			maxQueue: config.maxQueue ?? DEFAULT_QUEUE,
			maxBackoffMs: Math.min(
				config.maxBackoffMs ?? DEFAULT_BACKOFF,
				DEFAULT_BACKOFF
			),
			maxQueueDropWarnThreshold:
				config.maxQueueDropWarnThreshold ??
				Math.floor((config.maxQueue ?? DEFAULT_QUEUE) * 0.8),
			onUnknown: config.onUnknown ?? (() => {}),
			debug: config.debug ?? false,
		};
		this.worker = shared.worker;
		this.port = shared.port;
		this.port.start();
		this.port.addEventListener("message", this.onMessage as EventListener);
		this.port.postMessage({
			op: "init",
			config: {
				wsUrl: this.config.wsUrl,
				heartbeatMs: this.config.heartbeatMs,
				maxQueue: this.config.maxQueue,
				maxBackoffMs: this.config.maxBackoffMs,
				debug: this.config.debug,
			},
		} satisfies WorkerOutboundMessage);
		if (typeof window !== "undefined") {
			window.addEventListener("online", this.onlineHandler);
			window.addEventListener("offline", this.offlineHandler);
			if (typeof document !== "undefined") {
				document.addEventListener("visibilitychange", this.visibilityHandler);
			}
		}
	}

	send<T extends OutEvent>(event: T): Promise<void> {
		if (this.stopped) {
			return Promise.reject(new Error("Connection has been stopped"));
		}
		const validation = parseOutbound(event);
		if (!validation.ok) {
			return Promise.reject(new Error(validation.error.message));
		}
		const requestId = `req-${Date.now()}-${this.requestCounter++}`;
		return new Promise<void>((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			this.port.postMessage({
				op: "send",
				event: validation.value,
				requestId,
			} satisfies WorkerOutboundMessage);
		});
	}

	subscribe<E extends InEvent["type"]>(
		type: E,
		handler: (event: Extract<InEvent, { type: E }>) => void
	): () => void {
		const set =
			this.typeSubscribers.get(type) ?? new Set<(event: InEvent) => void>();
		set.add(handler as unknown as (incoming: InEvent) => void);
		this.typeSubscribers.set(type, set);
		return () => {
			set.delete(handler as unknown as (incoming: InEvent) => void);
			if (set.size === 0) {
				this.typeSubscribers.delete(type);
			}
		};
	}

	subscribeAll(handler: (event: InEvent) => void): () => void {
		this.allSubscribers.add(handler);
		return () => {
			this.allSubscribers.delete(handler);
		};
	}

	status(): ClientStatus {
		return { ...this.statusSnapshot };
	}

	subscribeStatus(handler: (status: ClientStatus) => void): () => void {
		this.statusSubscribers.add(handler);
		handler(this.status());
		return () => {
			this.statusSubscribers.delete(handler);
		};
	}

	stop(): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.port.postMessage({ op: "stop" } satisfies WorkerOutboundMessage);
		this.port.removeEventListener("message", this.onMessage as EventListener);
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
		for (const [, pending] of this.pending) {
			pending.reject(new Error("Connection stopped"));
		}
		this.pending.clear();
		this.statusSubscribers.clear();
	}

	private sendLifecycle(
		state: "online" | "offline" | "visible" | "hidden"
	): void {
		if (this.stopped) {
			return;
		}
		this.port.postMessage({
			op: "lifecycle",
			state,
		} satisfies WorkerOutboundMessage);
	}

	private onMessage = (event: MessageEvent): void => {
		const parsed = WorkerEventSchema.safeParse(event.data);
		if (!parsed.success) {
			if (this.config.debug) {
				console.warn(
					"[ws-client] Ignored malformed worker message",
					parsed.error
				);
			}
			return;
		}
		this.handleWorkerMessage(parsed.data);
	};

	private handleWorkerMessage(message: WorkerInboundMessage): void {
		switch (message.op) {
			case "event": {
				this.emit(message.event);
				break;
			}
			case "unknown": {
				this.config.onUnknown(message.envelope, message.error);
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
					pending.reject(
						new Error(`${message.error.code}: ${message.error.message}`)
					);
					this.pending.delete(message.requestId);
				}
				break;
			}
			case "status": {
				this.statusSnapshot = message.status;
				if (
					message.status.dropped >
					(this.config.maxQueueDropWarnThreshold ?? this.config.maxQueue * 0.8)
				) {
					console.warn(
						"[ws-client] outbound queue drops detected",
						message.status.dropped
					);
				}
				for (const listener of this.statusSubscribers) {
					listener({ ...this.statusSnapshot });
				}
				break;
			}
			case "tokenRequest": {
				this.provideToken(message.requestId);
				break;
			}
			case "log": {
				if (this.config.debug) {
					console[message.level === "error" ? "error" : "info"](
						`[ws-worker] ${message.message}`,
						message.details ?? {}
					);
				}
				break;
			}
			default: {
				if (this.config.debug) {
					console.warn("[ws-client] unhandled worker op", message);
				}
				break;
			}
		}
	}

	private provideToken(requestId: string): void {
		if (this.tokenPromise) {
			this.tokenPromise
				.then((token) => {
					this.port.postMessage({
						op: "tokenResponse",
						requestId,
						token,
					} satisfies WorkerOutboundMessage);
				})
				.catch((error) => {
					this.port.postMessage({
						op: "tokenError",
						requestId,
						reason: error.message,
					} satisfies WorkerOutboundMessage);
				});
			return;
		}
		this.tokenPromise = this.config.requestToken();
		this.tokenPromise
			.then((token) => {
				this.port.postMessage({
					op: "tokenResponse",
					requestId,
					token,
				} satisfies WorkerOutboundMessage);
			})
			.catch((error) => {
				this.port.postMessage({
					op: "tokenError",
					requestId,
					reason: error.message,
				} satisfies WorkerOutboundMessage);
			})
			.finally(() => {
				this.tokenPromise = null;
			});
	}

	private emit(event: InEvent): void {
		const specific = this.typeSubscribers.get(event.type);
		if (specific) {
			for (const subscriber of specific) {
				(subscriber as (incoming: InEvent) => void)(event);
			}
		}
		for (const subscriber of this.allSubscribers) {
			subscriber(event);
		}
	}
}

function createSharedWorker(config: ConnectionConfig): SharedClient | null {
	if (typeof SharedWorker === "undefined") {
		return null;
	}
	try {
		const worker = new SharedWorker(config.workerUrl, {
			type: "module",
			name: `ws:${config.wsUrl}`,
		});
		return { worker, port: worker.port };
	} catch (error) {
		console.warn(
			"[ws-client] SharedWorker creation failed, falling back",
			error
		);
		return null;
	}
}

export function getConnection(config: ConnectionConfig): WebSocketClient {
	assertBrowser();
	const key = makeKey(config);
	const existing = registry.get(key);
	if (existing) {
		return existing.client;
	}
	const shared = createSharedWorker(config);
	if (shared) {
		const client = new SharedWorkerClient(config, shared);
		registry.set(key, { client, stop: () => client.stop() });
		return client;
	}
	const fallback: LeaderClient = createLeaderConnection(config);
	registry.set(key, { client: fallback, stop: () => fallback.stop() });
	return fallback;
}
