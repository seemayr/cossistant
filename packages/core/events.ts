import { z } from "zod";

/**
 * Current envelope protocol version. Increment when breaking changes occur.
 */
export const ENVELOPE_VERSION = 1 as const;

/**
 * Base fields shared by every envelope exchanged over the socket.
 */
export type EnvelopeBase<TType extends string, TPayload> = {
	readonly v: typeof ENVELOPE_VERSION;
	readonly type: TType;
	readonly ts: number;
	readonly id: string;
	readonly payload: TPayload;
};

/**
 * Raw envelope shape prior to runtime validation.
 */
export type RawEnvelope = {
	readonly v: number;
	readonly type: string;
	readonly ts: number;
	readonly id: string;
	readonly payload: unknown;
};

/**
 * Outbound event describing actions initiated by the client.
 */
export type OutEvent =
	| EnvelopeBase<
			"support.message",
			{
				conversationId: string;
				body: string;
				attachments?: Array<{ id: string; url: string }>;
			}
	  >
	| EnvelopeBase<
			"support.presence",
			{
				conversationId: string;
				status: "typing" | "idle" | "offline";
			}
	  >
	| EnvelopeBase<
			"dashboard.query",
			{
				query: string;
				params?: Record<string, string | number | boolean>;
			}
	  >
	| EnvelopeBase<"ping", { sequence: number }>;

/**
 * Inbound events originating from the server.
 */
export type InEvent =
	| EnvelopeBase<
			"support.message.received",
			{
				conversationId: string;
				messageId: string;
				body: string;
				from: "agent" | "customer";
			}
	  >
	| EnvelopeBase<
			"support.presence.updated",
			{
				conversationId: string;
				participantId: string;
				status: "typing" | "idle" | "offline";
			}
	  >
	| EnvelopeBase<
			"dashboard.metrics",
			{
				name: string;
				value: number;
				window: "1m" | "5m" | "1h";
			}
	  >
	| EnvelopeBase<
			"auth.expired",
			{
				reason: "token_expired" | "revoked";
			}
	  >
	| EnvelopeBase<"pong", { sequence: number }>;

/**
 * Strict zod schema representing the envelope with version 1.
 */
const EnvelopeSchemaV1 = z.object({
	v: z.literal(ENVELOPE_VERSION),
	type: z.string().min(1),
	ts: z.number({ description: "Unix epoch timestamp in milliseconds" }).min(0),
	id: z.string().min(8),
	payload: z.unknown(),
});

const SupportMessageSchema = EnvelopeSchemaV1.extend({
	type: z.literal("support.message"),
	payload: z.object({
		conversationId: z.string().min(1),
		body: z.string().min(1),
		attachments: z
			.array(z.object({ id: z.string().min(1), url: z.string().url() }))
			.optional(),
	}),
});

const SupportPresenceSchema = EnvelopeSchemaV1.extend({
	type: z.literal("support.presence"),
	payload: z.object({
		conversationId: z.string().min(1),
		status: z.enum(["typing", "idle", "offline"]),
	}),
});

const DashboardQuerySchema = EnvelopeSchemaV1.extend({
	type: z.literal("dashboard.query"),
	payload: z.object({
		query: z.string().min(1),
		params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
	}),
});

const PingSchema = EnvelopeSchemaV1.extend({
	type: z.literal("ping"),
	payload: z.object({ sequence: z.number().int().nonnegative() }),
});

const SupportMessageReceivedSchema = EnvelopeSchemaV1.extend({
	type: z.literal("support.message.received"),
	payload: z.object({
		conversationId: z.string().min(1),
		messageId: z.string().min(1),
		body: z.string().min(1),
		from: z.enum(["agent", "customer"]),
	}),
});

const SupportPresenceUpdatedSchema = EnvelopeSchemaV1.extend({
	type: z.literal("support.presence.updated"),
	payload: z.object({
		conversationId: z.string().min(1),
		participantId: z.string().min(1),
		status: z.enum(["typing", "idle", "offline"]),
	}),
});

const DashboardMetricsSchema = EnvelopeSchemaV1.extend({
	type: z.literal("dashboard.metrics"),
	payload: z.object({
		name: z.string().min(1),
		value: z.number(),
		window: z.enum(["1m", "5m", "1h"]),
	}),
});

const AuthExpiredSchema = EnvelopeSchemaV1.extend({
	type: z.literal("auth.expired"),
	payload: z.object({ reason: z.enum(["token_expired", "revoked"]) }),
});

const PongSchema = EnvelopeSchemaV1.extend({
	type: z.literal("pong"),
	payload: z.object({ sequence: z.number().int().nonnegative() }),
});

/**
 * Runtime schema validating every supported outbound event.
 */
export const OutEventSchema = z.discriminatedUnion("type", [
	SupportMessageSchema,
	SupportPresenceSchema,
	DashboardQuerySchema,
	PingSchema,
]);

/**
 * Runtime schema validating every supported inbound event.
 */
export const InEventSchema = z.discriminatedUnion("type", [
	SupportMessageReceivedSchema,
	SupportPresenceUpdatedSchema,
	DashboardMetricsSchema,
	AuthExpiredSchema,
	PongSchema,
]);

export type ParseError = {
	readonly ok: false;
	readonly error: {
		readonly code: "invalid_envelope" | "unsupported_version";
		readonly message: string;
		readonly issues?: z.ZodIssue[];
	};
};

export type ParseSuccess<T> = {
	readonly ok: true;
	readonly value: T;
};

/**
 * Parse an inbound envelope and return a typed discriminated union or
 * a structured error payload to bubble up to diagnostics.
 */
export function parseInbound(raw: unknown): ParseSuccess<InEvent> | ParseError {
	const versionResult = EnvelopeSchemaV1.safeParse(raw);
	if (!versionResult.success) {
		const candidate = raw as RawEnvelope;
		if (typeof candidate?.v === "number" && candidate.v !== ENVELOPE_VERSION) {
			return {
				ok: false,
				error: {
					code: "unsupported_version",
					message: `Unsupported envelope version: ${candidate.v}`,
					issues: versionResult.error.issues,
				},
			};
		}
		return {
			ok: false,
			error: {
				code: "invalid_envelope",
				message: "Inbound envelope failed validation",
				issues: versionResult.error.issues,
			},
		};
	}

	const typed = InEventSchema.safeParse(versionResult.data);
	if (!typed.success) {
		return {
			ok: false,
			error: {
				code: "invalid_envelope",
				message: "Inbound envelope payload failed validation",
				issues: typed.error.issues,
			},
		};
	}

	return { ok: true, value: typed.data };
}

/**
 * Parse an outbound envelope, returning the typed value or a structured error.
 */
export function parseOutbound(
	raw: unknown
): ParseSuccess<OutEvent> | ParseError {
	const result = OutEventSchema.safeParse(raw);
	if (!result.success) {
		const candidate = raw as RawEnvelope;
		if (typeof candidate?.v === "number" && candidate.v !== ENVELOPE_VERSION) {
			return {
				ok: false,
				error: {
					code: "unsupported_version",
					message: `Unsupported envelope version: ${candidate.v}`,
					issues: result.error.issues,
				},
			};
		}
		return {
			ok: false,
			error: {
				code: "invalid_envelope",
				message: "Outbound envelope failed validation",
				issues: result.error.issues,
			},
		};
	}

	return { ok: true, value: result.data };
}

/**
 * Narrow an inbound event by type while preserving payload typing.
 */
export function isEventType<TType extends InEvent["type"]>(
	event: InEvent,
	type: TType
): event is Extract<InEvent, { type: TType }> {
	return event.type === type;
}

/**
 * Helper returning all inbound events that match a specific discriminator.
 */
export function filterEvents<TType extends InEvent["type"]>(
	events: readonly InEvent[],
	type: TType
): Extract<InEvent, { type: TType }>[] {
	return events.filter(
		(evt): evt is Extract<InEvent, { type: TType }> => evt.type === type
	);
}

/**
 * Recognised versions for the transport protocol.
 */
export const SUPPORTED_VERSIONS = [ENVELOPE_VERSION] as const;

/**
 * Attempt to migrate an unknown envelope into the current shape.
 * The implementation is intentionally strict: it only accepts envelopes that
 * already comply with the current version, allowing future extension points
 * to plug in custom migration strategies without risking silent corruption.
 */
export function migrateUnknown(raw: RawEnvelope): InEvent | null {
	if (raw.v === ENVELOPE_VERSION) {
		const parsed = parseInbound(raw);
		return parsed.ok ? parsed.value : null;
	}
	return null;
}

/**
 * Compute an exponential backoff delay with full jitter.
 * @param attempt 1-based retry attempt counter.
 * @param baseMs Minimum backoff interval in milliseconds.
 * @param maxMs Maximum backoff interval cap in milliseconds.
 */
export function computeBackoffDelay(
	attempt: number,
	baseMs: number,
	maxMs: number
): number {
	const exp = 2 ** Math.max(0, attempt - 1);
	const raw = baseMs * exp;
	const capped = Math.min(maxMs, raw);
	const jitter = Math.random() * capped * 0.5;
	return Math.min(maxMs, Math.round(capped / 2 + jitter));
}

/**
 * A bounded queue that drops the oldest entry when capacity is exceeded.
 */
export class DroppingQueue<T> {
	private readonly items: T[] = [];
	private dropped = 0;
	private readonly capacity: number;

	constructor(capacity: number) {
		this.capacity = capacity;
		if (capacity <= 0) {
			throw new Error("Queue capacity must be positive");
		}
	}

	push(value: T): { dropped: boolean; droppedValue?: T } {
		let droppedValue: T | undefined;
		if (this.items.length >= this.capacity) {
			droppedValue = this.items.shift();
			this.dropped += 1;
		}
		this.items.push(value);
		return { dropped: droppedValue !== undefined, droppedValue };
	}

	shift(): T | undefined {
		return this.items.shift();
	}

	clear(): void {
		this.items.splice(0, this.items.length);
		this.dropped = 0;
	}

	size(): number {
		return this.items.length;
	}

	droppedCount(): number {
		return this.dropped;
	}

	toArray(): T[] {
		return [...this.items];
	}
}
