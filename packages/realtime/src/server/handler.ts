/** biome-ignore-all lint/nursery/noUnnecessaryConditions: ok */
/** biome-ignore-all lint/suspicious/noConfusingVoidType: ok */
/** biome-ignore-all lint/suspicious/noExplicitAny: ok zod handles the types */

import type { SystemEvent, UserEvent } from "../types.js";
import type { Opts, Realtime } from "./realtime.js";

type MiddlewareFn = ({
  request,
  channel,
}: {
  request: Request;
  channel: string;
}) => Response | void | Promise<Response | void>;

type MessageFilter<T> = ({
  event,
  request,
  channel,
}: {
  event: UserEvent<T>;
  request: Request;
  channel: string;
}) => boolean | Promise<boolean>;

type ResponseHeadersFn = ({
  request,
  channel,
}: {
  request: Request;
  channel: string;
}) => HeadersInit | undefined;

export function handle<T extends Opts>(config: {
  realtime: Realtime<T>;
  middleware?: MiddlewareFn;
  filter?: MessageFilter<unknown>;
  responseHeaders?: ResponseHeadersFn;
}): (request: Request) => Promise<Response | void> {
  return async (request: Request) => {
    const requestStartTime = Date.now();
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel") || "default";
    const reconnect = searchParams.get("reconnect");
    const last_ack = searchParams.get("last_ack");

    const redis = config.realtime._redis;
    const logger = config.realtime._logger;

    if (config.middleware) {
      const result = await config.middleware({ request, channel });
      if (result) {
        return result;
      }
    }

    if (!redis) {
      logger.error("No Redis instance provided to Realtime");
      return new Response(JSON.stringify({ error: "Redis not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let cleanup: (() => Promise<void>) | undefined;
    let subscriber: ReturnType<typeof redis.duplicate> | undefined;
    let reconnectTimeout: NodeJS.Timeout | undefined;
    let keepaliveInterval: NodeJS.Timeout | undefined;
    let isClosed = false;
    let handleAbort: (() => Promise<void>) | undefined;

    const streamKey = `channel:${channel}`;

    const stream = new ReadableStream({
      async start(controller) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }

        const safeEnqueue = (data: Uint8Array) => {
          if (!isClosed) {
            controller.enqueue(data);
          }
        };

        const sendUserEvent = async (event: UserEvent) => {
          if (config.filter) {
            try {
              const shouldSend = await config.filter({
                event,
                request,
                channel,
              });
              if (!shouldSend) {
                return;
              }
            } catch (error) {
              logger.error("⚠️ Filter function failed", error);
              return;
            }
          }

          safeEnqueue(json(event));
        };

        const closeStream = async () => {
          if (isClosed) {
            return;
          }
          isClosed = true;

          clearTimeout(reconnectTimeout);
          clearInterval(keepaliveInterval);

          if (handleAbort) {
            request.signal.removeEventListener("abort", handleAbort);
          }

          if (subscriber) {
            try {
              await subscriber.unsubscribe(streamKey);
            } catch (err) {
              logger.error("⚠️ Error during unsubscribe:", err);
            }
            subscriber.disconnect();
            subscriber = undefined;
          }

          controller.close();
        };

        cleanup = closeStream;

        handleAbort = async () => {
          await closeStream();
        };

        request.signal.addEventListener("abort", handleAbort);

        subscriber = redis.duplicate();
        await subscriber.connect();
        await subscriber.subscribe(streamKey);

        const elapsedMs = Date.now() - requestStartTime;
        const remainingMs = config.realtime._maxDurationSecs * 1000 - elapsedMs;
        const streamDurationMs = Math.max(remainingMs - 2000, 1000);

        reconnectTimeout = setTimeout(async () => {
          safeEnqueue(json({ type: "reconnect" }));
          await closeStream();
        }, streamDurationMs);

        const sendConnectedEvent = (cursor?: string) => {
          const connectedEvent: SystemEvent = {
            type: "connected",
            channel,
            ...(cursor ? { cursor } : {}),
          };
          safeEnqueue(json(connectedEvent));
        };

        const replayMissedMessages = async () => {
          if (!(reconnect === "true" && last_ack)) {
            const lastMessage = await redis.xrevrange(
              streamKey,
              "+",
              "-",
              "COUNT",
              1
            );
            const cursor = lastMessage[0]?.[0] ?? "0-0";
            sendConnectedEvent(cursor);
            return;
          }

          const startId = `(${last_ack}`;
          const missingMessages = await redis.xrange(streamKey, startId, "+");

          sendConnectedEvent();

          for (const entry of missingMessages) {
            const parsed = parseStreamEntry(entry);
            if (!parsed) {
              continue;
            }

            const userEvent: UserEvent = {
              data: parsed.data,
              __event_path: parsed.__event_path,
              __stream_id: parsed.id,
            };

            await sendUserEvent(userEvent);
          }
        };

        await replayMissedMessages();

        subscriber.on("error", (err: Error) => {
          logger.error("⚠️ Redis subscriber error:", err);

          const errorEvent: SystemEvent = {
            type: "error",
            error: err.message,
          };

          safeEnqueue(json(errorEvent));
        });

        subscriber.on("unsubscribe", () => {
          logger.log("⬅️ Client unsubscribed from channel:", channel);

          const unsubscribedEvent: SystemEvent = {
            type: "disconnected",
            channel,
          };

          safeEnqueue(json(unsubscribedEvent));
        });

        subscriber.on("message", async (_channel, message) => {
          let parsed: PublishedPayload | null = null;
          try {
            parsed = parsePublishedPayload(message);
          } catch (error) {
            logger.error("⚠️ Failed to parse realtime payload", error);
          }

          if (!parsed) {
            return;
          }

          if (parsed.type === "ping") {
            const pingEvent: SystemEvent = {
              type: "ping",
              timestamp: parsed.timestamp,
            };
            safeEnqueue(json(pingEvent));
            return;
          }

          const userEvent: UserEvent = {
            data: parsed.data,
            __event_path: parsed.__event_path,
            __stream_id: parsed.__stream_id,
          };

          logger.log("⬇️  Received event:", {
            channel: _channel,
            __event_path: parsed.__event_path,
            data: parsed.data,
          });

          await sendUserEvent(userEvent);
        });

        keepaliveInterval = setInterval(async () => {
          await redis.publish(
            streamKey,
            JSON.stringify({ type: "ping", timestamp: Date.now() })
          );
        }, 10_000);
      },

      async cancel() {
        await cleanup?.();
      },
    });

    const headers = config.responseHeaders
      ? config.responseHeaders({ request, channel })
      : undefined;

    return new StreamingResponse(stream, {
      headers,
    });
  };
}

type PublishedPayload =
  | ({ type: "ping"; timestamp: number } & Record<string, never>)
  | ({
      __event_path: string[];
      __stream_id: string;
      data: unknown;
    } & Record<string, never>);

function parsePublishedPayload(message: unknown): PublishedPayload | null {
  if (typeof message !== "string") {
    return null;
  }

  const parsed = JSON.parse(message) as PublishedPayload | null;

  if (!parsed) {
    return null;
  }

  if ((parsed as { type?: string }).type === "ping") {
    return parsed;
  }

  if (
    "__event_path" in parsed &&
    Array.isArray(parsed.__event_path) &&
    "data" in parsed &&
    "__stream_id" in parsed
  ) {
    return parsed;
  }

  return null;
}

type StreamEntry = [string, string[]];

type ParsedStreamEntry = {
  id: string;
  data: unknown;
  __event_path: string[];
};

function parseStreamEntry(entry: StreamEntry): ParsedStreamEntry | null {
  const [id, fields] = entry;
  const record: Record<string, string> = {};

  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];

    if (typeof key !== "string") {
      continue;
    }

    record[key] = typeof value === "string" ? value : String(value ?? "");
  }

  const raw = record.payload ?? null;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      data: unknown;
      __event_path: string[];
    };

    return {
      id,
      data: parsed.data,
      __event_path: parsed.__event_path,
    };
  } catch (error) {
    console.warn("Failed to parse stream entry", { error });
    return null;
  }
}

function json<T>(data: SystemEvent | UserEvent<T>) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

class StreamingResponse extends Response {
  constructor(res: ReadableStream<any>, init?: ResponseInit) {
    super(res as any, {
      ...init,
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
        ...(init?.headers ?? {}),
      },
    });
  }
}
