/**
 * Tinybird Analytics Client (Official SDK Wrapper)
 *
 * Wraps the official @tinybirdco/sdk with production features:
 * - Event batching (100 events or 5s auto-flush)
 * - Retry logic with exponential backoff
 * - Graceful shutdown handlers
 * - Type-safe query functions
 */

import type { Database } from "@api/db";
import { findVisitorForWebsite } from "@api/db/queries/visitor";
import { env } from "@api/env";
import {
	type FlattenedVisitorTrackingContext,
	flattenVisitorTrackingContext,
} from "@api/lib/visitor-attribution";
import { createTinybirdApi } from "@tinybirdco/sdk";

// ============================================================================
// Types
// ============================================================================

export type PresenceEvent = {
	timestamp: Date;
	website_id: string;
	entity_id: string;
	entity_type: "visitor" | "user";
	name: string;
	image: string;
	country_code: string;
	city: string;
	latitude: number;
	longitude: number;
};

export type ConversationMetricEvent = {
	timestamp: Date;
	website_id: string;
	visitor_id: string;
	event_type:
		| "conversation_started"
		| "conversation_resolved"
		| "first_response"
		| "ai_resolved"
		| "escalated"
		| "feedback_submitted";
	conversation_id: string;
	duration_seconds: number;
} & FlattenedVisitorTrackingContext;

export type VisitorEvent = {
	timestamp: Date;
	website_id: string;
	visitor_id: string;
	event_type: "page_view";
} & FlattenedVisitorTrackingContext;

type TinybirdEvent = PresenceEvent | ConversationMetricEvent | VisitorEvent;

// ============================================================================
// Configuration
// ============================================================================

const TINYBIRD_HOST = env.TINYBIRD_HOST;
const TINYBIRD_TOKEN = env.TINYBIRD_TOKEN;

// Event batching configuration
const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000; // 5 seconds

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

// ============================================================================
// Official SDK Client
// ============================================================================

const tinybirdClient = createTinybirdApi({
	baseUrl: TINYBIRD_HOST,
	token: TINYBIRD_TOKEN,
});

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries = MAX_RETRIES
): Promise<T> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			// Check if it's a retryable error
			const isRetryable =
				error instanceof Error &&
				(error.message.includes("429") ||
					error.message.includes("500") ||
					error.message.includes("502") ||
					error.message.includes("503"));

			if (isRetryable && attempt < maxRetries) {
				const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
				console.warn(
					`[Tinybird] Request failed, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
				);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				continue;
			}

			throw error;
		}
	}

	throw lastError || new Error("Max retries exceeded");
}

// ============================================================================
// Event Buffer for Batch Ingestion
// ============================================================================

class EventBuffer<T extends TinybirdEvent> {
	private buffer: T[] = [];
	private flushTimer?: NodeJS.Timeout;
	private datasource: string;
	private batchSize: number;
	private flushInterval: number;

	constructor(
		datasource: string,
		batchSize = BATCH_SIZE,
		flushInterval = FLUSH_INTERVAL_MS
	) {
		this.datasource = datasource;
		this.batchSize = batchSize;
		this.flushInterval = flushInterval;
		this.startFlushTimer();
	}

	add(event: T): void {
		this.buffer.push(event);

		if (this.buffer.length >= this.batchSize) {
			// Don't await - fire and forget
			void this.flush();
		}
	}

	async flush(): Promise<void> {
		if (this.buffer.length === 0) {
			return;
		}

		const events = [...this.buffer];
		this.buffer = [];

		try {
			await ingestBatch(this.datasource, events);
		} catch (error) {
			console.error(
				`[Tinybird] Failed to flush ${events.length} events to ${this.datasource}:`,
				error
			);
		}
	}

	private startFlushTimer(): void {
		this.flushTimer = setInterval(() => {
			void this.flush();
		}, this.flushInterval);
	}

	async destroy(): Promise<void> {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}
		await this.flush();
	}
}

// ============================================================================
// Ingestion Functions
// ============================================================================

/**
 * Ingest a batch of events using NDJSON format via official SDK.
 * NDJSON (newline-delimited JSON) allows 1000+ RPS throughput.
 */
async function ingestBatch<T extends TinybirdEvent>(
	datasource: string,
	events: T[]
): Promise<void> {
	if (events.length === 0) {
		return;
	}

	// Convert to NDJSON format
	const ndjson = events.map((event) => JSON.stringify(event)).join("\n");

	await withRetry(async () => {
		const response = await fetch(
			`${TINYBIRD_HOST}/v0/events?name=${datasource}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${TINYBIRD_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: ndjson,
			}
		);

		if (!response.ok) {
			throw new Error(
				`Tinybird ingestion failed: ${response.status} ${response.statusText}`
			);
		}

		return response.json();
	});
}

/**
 * Ingest a single event immediately (no batching) via official SDK.
 * Use for critical events that need immediate ingestion.
 */
export async function ingestEvent<T extends TinybirdEvent>(
	datasource: string,
	event: T
): Promise<void> {
	await withRetry(async () => {
		await tinybirdClient.ingest(datasource, event);
	});
}

// ============================================================================
// Event Buffers (Singleton Instances)
// ============================================================================

const presenceEventBuffer = new EventBuffer<PresenceEvent>("presence_events");
const visitorEventBuffer = new EventBuffer<VisitorEvent>("visitor_events");
const conversationMetricBuffer = new EventBuffer<ConversationMetricEvent>(
	"conversation_metrics"
);
const EMPTY_TRACKING_CONTEXT = flattenVisitorTrackingContext({});

/**
 * Track a presence heartbeat for a visitor or user.
 * Events are batched and flushed every 5 seconds or when 100 events are buffered.
 */
export function trackPresence(
	event: Omit<
		PresenceEvent,
		| "timestamp"
		| "name"
		| "image"
		| "country_code"
		| "city"
		| "latitude"
		| "longitude"
	> & {
		name?: string;
		image?: string;
		country_code?: string;
		city?: string;
		latitude?: number;
		longitude?: number;
	}
): void {
	presenceEventBuffer.add({
		...event,
		timestamp: new Date(),
		name: event.name ?? "",
		image: event.image ?? "",
		country_code: event.country_code ?? "",
		city: event.city ?? "",
		latitude: event.latitude ?? 0,
		longitude: event.longitude ?? 0,
	});
}

export function trackVisitorEvent(
	event: Omit<VisitorEvent, "timestamp">
): void {
	visitorEventBuffer.add({
		...EMPTY_TRACKING_CONTEXT,
		...event,
		timestamp: new Date(),
	});
}

/**
 * Track a conversation metric event.
 * Events are batched and flushed every 5 seconds or when 100 events are buffered.
 */
export function trackConversationMetric(
	event: Omit<ConversationMetricEvent, "timestamp" | "duration_seconds"> & {
		duration_seconds?: number;
	}
): void {
	conversationMetricBuffer.add({
		...EMPTY_TRACKING_CONTEXT,
		...event,
		timestamp: new Date(),
		duration_seconds: event.duration_seconds ?? 0,
	});
}

export async function trackConversationMetricForVisitor(
	db: Database,
	event: Omit<
		ConversationMetricEvent,
		"timestamp" | "duration_seconds" | keyof FlattenedVisitorTrackingContext
	> & {
		duration_seconds?: number;
	}
): Promise<void> {
	try {
		const visitor = await findVisitorForWebsite(db, {
			visitorId: event.visitor_id,
			websiteId: event.website_id,
		});

		trackConversationMetric({
			...event,
			...flattenVisitorTrackingContext({
				attribution: visitor?.attribution ?? null,
				currentPage: visitor?.currentPage ?? null,
			}),
			duration_seconds: event.duration_seconds,
		});
	} catch (error) {
		console.error("[Tinybird] Failed to enrich visitor attribution", error);
		trackConversationMetric({
			...EMPTY_TRACKING_CONTEXT,
			...event,
			duration_seconds: event.duration_seconds,
		});
	}
}

// ============================================================================
// Query Functions
// ============================================================================

type InboxAnalyticsParams = {
	website_id: string;
	date_from: string; // ISO 8601
	date_to: string; // ISO 8601
	prev_date_from: string; // ISO 8601
	prev_date_to: string; // ISO 8601
};

type InboxAnalyticsRow = {
	event_type: string;
	median_duration: number | null;
	event_count: number;
	period: "current" | "previous";
};

type InboxAnalyticsResponse = {
	data: InboxAnalyticsRow[];
};

export async function queryInboxAnalytics(
	params: InboxAnalyticsParams
): Promise<InboxAnalyticsResponse> {
	return withRetry(async () => {
		const result = await tinybirdClient.query<InboxAnalyticsRow>(
			"inbox_analytics",
			{
				website_id: params.website_id,
				date_from: params.date_from,
				date_to: params.date_to,
				prev_date_from: params.prev_date_from,
				prev_date_to: params.prev_date_to,
			}
		);

		return { data: result.data };
	});
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Flush all buffered events before shutting down.
 * Call this in your process exit handler.
 */
export async function flushAllEvents(): Promise<void> {
	await Promise.all([
		presenceEventBuffer.destroy(),
		visitorEventBuffer.destroy(),
		conversationMetricBuffer.destroy(),
	]);
}

// Register shutdown handlers
process.on("SIGTERM", () => void flushAllEvents());
process.on("SIGINT", () => void flushAllEvents());
