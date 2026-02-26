import { z } from "zod";
import { visitorResponseSchema } from "../api/visitor";
import { conversationRecordSchema } from "./conversation";

export const blockVisitorResponseSchema = z.object({
	conversation: conversationRecordSchema,
	visitor: visitorResponseSchema,
});

export type BlockVisitorResponse = z.infer<typeof blockVisitorResponseSchema>;

export const visitorPresenceEntrySchema = z.object({
	id: z.ulid(),
	status: z.enum(["online", "away"]),
	lastSeenAt: z.string().datetime({ offset: true }).nullable(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	image: z.string().nullable(),
	city: z.string().nullable(),
	region: z.string().nullable(),
	country: z.string().nullable(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	contactId: z.ulid().nullable(),
});

export const visitorPresenceProfileSchema = z.object({
	id: z.ulid(),
	lastSeenAt: z.string().datetime({ offset: true }).nullable(),
	city: z.string().nullable(),
	region: z.string().nullable(),
	country: z.string().nullable(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	contactId: z.ulid().nullable(),
	contactName: z.string().nullable(),
	contactEmail: z.string().nullable(),
	contactImage: z.string().nullable(),
});

export const listVisitorPresenceProfilesResponseSchema = z.object({
	profilesByVisitorId: z.record(z.string(), visitorPresenceProfileSchema),
});

export type VisitorPresenceEntry = z.infer<typeof visitorPresenceEntrySchema>;
export type VisitorPresenceProfile = z.infer<
	typeof visitorPresenceProfileSchema
>;
export type ListVisitorPresenceProfilesResponse = z.infer<
	typeof listVisitorPresenceProfilesResponseSchema
>;
