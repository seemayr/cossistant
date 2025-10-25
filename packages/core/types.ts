import type { InEvent, OutEvent, ParseError, RawEnvelope } from "./events";

export type ConnectionConfig = {
	readonly workerUrl: URL;
	readonly wsUrl: string;
	readonly requestToken: () => Promise<string>;
	readonly heartbeatMs?: number;
	readonly maxQueue?: number;
	readonly maxBackoffMs?: number;
	readonly maxQueueDropWarnThreshold?: number;
	readonly debug?: boolean;
	readonly onUnknown?: (envelope: RawEnvelope, error: ParseError) => void;
};

export type ClientStatus = {
	readonly state: "connecting" | "open" | "closed" | "waiting";
	readonly attempts: number;
	readonly since: number;
	readonly queueSize: number;
	readonly dropped: number;
};

export type WebSocketClient = {
	send<T extends OutEvent>(event: T): Promise<void>;
	subscribe<E extends InEvent["type"]>(
		type: E,
		handler: (event: Extract<InEvent, { type: E }>) => void
	): () => void;
	subscribeAll(handler: (event: InEvent) => void): () => void;
	subscribeStatus?(handler: (status: ClientStatus) => void): () => void;
	status(): ClientStatus;
	stop(): void;
};
