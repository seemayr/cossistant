import { getRedis } from "@api/redis";
import { Realtime } from "@cossistant/realtime/server";
import { RealtimeEvents } from "@cossistant/types/realtime-events";
import { z } from "zod";

const messageCreatedEventSchema = z.object({
        type: z.literal("MESSAGE_CREATED"),
        payload: RealtimeEvents.MESSAGE_CREATED,
        timestamp: z.number(),
        organizationId: z.string(),
        websiteId: z.string(),
        visitorId: z.string().nullable(),
});

const redis = getRedis();

export const realtime = new Realtime({
        redis,
        verbose: process.env.NODE_ENV !== "production",
        schema: {
                message: z.object({
                        created: messageCreatedEventSchema,
                }),
        },
});

export type RealtimeMessageEvent = z.infer<typeof messageCreatedEventSchema>;
