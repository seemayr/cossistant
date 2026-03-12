import { z } from "@hono/zod-openapi";
import { contactResponseSchema } from "./contact";

/**
 * Visitor metadata are stored as key value pairs
 * Values can be strings, numbers, booleans, or null
 */
export const visitorMetadataSchema = z.record(
	z.string(),
	z.string().or(z.number()).or(z.boolean()).or(z.null())
);

/**
 * Contact information for identified visitors
 */
export const publicContactResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The contact's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	name: z.string().nullable().openapi({
		description: "The contact's name.",
		example: "John Doe",
	}),
	email: z.string().nullable().openapi({
		description: "The contact's email address.",
		example: "john.doe@example.com",
	}),
	image: z.string().nullable().openapi({
		description: "The contact's avatar/profile image URL.",
		example: "https://example.com/avatar.png",
	}),
	metadataHash: z.string().optional().openapi({
		description:
			"Hash of the contact's metadata. Used to detect if metadata has changed without comparing full objects.",
		example: "a1b2c3d4",
	}),
});

export type PublicContact = z.infer<typeof publicContactResponseSchema>;

export type VisitorMetadata = z.infer<typeof visitorMetadataSchema>;

export const attributionChannelSchema = z.enum([
	"direct",
	"email",
	"paid",
	"organic_search",
	"social",
	"referral",
]);

const nullableStringSchema = z.string().nullable();
const nullableUrlSchema = z.string().url().nullable();

export const visitorAttributionReferrerSchema = z.object({
	url: nullableUrlSchema.openapi({
		description:
			"Sanitized external referrer URL without arbitrary query data.",
		example: "https://news.ycombinator.com/item?id=123",
	}),
	domain: nullableStringSchema.openapi({
		description: "Normalized referrer hostname.",
		example: "news.ycombinator.com",
	}),
});

export const visitorAttributionLandingSchema = z.object({
	url: nullableUrlSchema.openapi({
		description:
			"Sanitized landing page URL including only supported attribution params.",
		example:
			"https://app.example.com/pricing?utm_source=hn&utm_medium=community",
	}),
	path: nullableStringSchema.openapi({
		description: "Landing page path.",
		example: "/pricing",
	}),
	title: nullableStringSchema.openapi({
		description: "Document title captured on the landing page.",
		example: "Pricing | Example",
	}),
});

export const visitorAttributionUtmSchema = z.object({
	source: nullableStringSchema.openapi({
		description: "UTM source value.",
		example: "hn",
	}),
	medium: nullableStringSchema.openapi({
		description: "UTM medium value.",
		example: "community",
	}),
	campaign: nullableStringSchema.openapi({
		description: "UTM campaign value.",
		example: "launch_week",
	}),
	content: nullableStringSchema.openapi({
		description: "UTM content value.",
		example: "hero_cta",
	}),
	term: nullableStringSchema.openapi({
		description: "UTM term value.",
		example: "ai support",
	}),
});

export const visitorAttributionClickIdsSchema = z.object({
	gclid: nullableStringSchema.openapi({
		description: "Google Ads click identifier.",
		example: "gclid_123",
	}),
	gbraid: nullableStringSchema.openapi({
		description: "Google iOS app click identifier.",
		example: "gbraid_123",
	}),
	wbraid: nullableStringSchema.openapi({
		description: "Google web-to-app click identifier.",
		example: "wbraid_123",
	}),
	fbclid: nullableStringSchema.openapi({
		description: "Meta click identifier.",
		example: "fbclid_123",
	}),
	msclkid: nullableStringSchema.openapi({
		description: "Microsoft Ads click identifier.",
		example: "msclkid_123",
	}),
	ttclid: nullableStringSchema.openapi({
		description: "TikTok click identifier.",
		example: "ttclid_123",
	}),
	li_fat_id: nullableStringSchema.openapi({
		description: "LinkedIn click identifier.",
		example: "li_fat_id_123",
	}),
	twclid: nullableStringSchema.openapi({
		description: "X/Twitter click identifier.",
		example: "twclid_123",
	}),
});

export const visitorAttributionFirstTouchSchema = z.object({
	channel: attributionChannelSchema.openapi({
		description: "Derived acquisition channel.",
		example: "referral",
	}),
	isDirect: z.boolean().openapi({
		description: "Whether the visit should be treated as direct traffic.",
		example: false,
	}),
	referrer: visitorAttributionReferrerSchema,
	landing: visitorAttributionLandingSchema,
	utm: visitorAttributionUtmSchema,
	clickIds: visitorAttributionClickIdsSchema,
	capturedAt: z.string().openapi({
		description: "When the first-touch attribution snapshot was captured.",
		example: "2026-03-12T10:00:00.000Z",
	}),
});

export const visitorAttributionSchema = z.object({
	version: z.literal(1).openapi({
		description: "Schema version for the attribution payload.",
		example: 1,
	}),
	firstTouch: visitorAttributionFirstTouchSchema,
});

export const visitorCurrentPageSchema = z.object({
	url: nullableUrlSchema.openapi({
		description:
			"Sanitized current page URL including only supported attribution params.",
		example: "https://app.example.com/pricing",
	}),
	path: nullableStringSchema.openapi({
		description: "Current page path.",
		example: "/pricing",
	}),
	title: nullableStringSchema.openapi({
		description: "Current document title.",
		example: "Pricing | Example",
	}),
	referrerUrl: nullableUrlSchema.openapi({
		description:
			"Sanitized document referrer URL for the current page context.",
		example: "https://news.ycombinator.com/item?id=123",
	}),
	updatedAt: z.string().openapi({
		description: "When the current page context was last updated.",
		example: "2026-03-12T10:00:05.000Z",
	}),
});

export type AttributionChannel = z.infer<typeof attributionChannelSchema>;
export type VisitorAttributionReferrer = z.infer<
	typeof visitorAttributionReferrerSchema
>;
export type VisitorAttributionLanding = z.infer<
	typeof visitorAttributionLandingSchema
>;
export type VisitorAttributionUtm = z.infer<typeof visitorAttributionUtmSchema>;
export type VisitorAttributionClickIds = z.infer<
	typeof visitorAttributionClickIdsSchema
>;
export type VisitorAttributionFirstTouch = z.infer<
	typeof visitorAttributionFirstTouchSchema
>;
export type VisitorAttribution = z.infer<typeof visitorAttributionSchema>;
export type VisitorCurrentPage = z.infer<typeof visitorCurrentPageSchema>;

/**
 * Visitor data update request schema
 */
export const updateVisitorRequestSchema = z.object({
	externalId: z
		.string()
		.openapi({
			description:
				"External identifier for the visitor (e.g. from your system).",
			example: "user_12345",
		})
		.optional(),
	name: z
		.string()
		.openapi({
			description: "The visitor's name.",
			example: "John Doe",
		})
		.optional(),
	email: z
		.string()
		.email()
		.openapi({
			description: "The visitor's email address.",
			example: "john.doe@example.com",
		})
		.optional(),
	browser: z
		.string()
		.openapi({
			description: "The visitor's browser.",
			example: "Chrome",
		})
		.optional(),
	browserVersion: z
		.string()
		.openapi({
			description: "The visitor's browser version.",
			example: "120.0.0",
		})
		.optional(),
	os: z
		.string()
		.openapi({
			description: "The visitor's operating system.",
			example: "Windows",
		})
		.optional(),
	osVersion: z
		.string()
		.openapi({
			description: "The visitor's operating system version.",
			example: "11",
		})
		.optional(),
	device: z
		.string()
		.openapi({
			description: "The visitor's device.",
			example: "MacBook Pro",
		})
		.optional(),
	deviceType: z
		.enum(["desktop", "mobile", "tablet", "unknown"])
		.openapi({
			description: "The visitor's device type.",
			example: "desktop",
		})
		.optional(),
	ip: z
		.string()
		.openapi({
			description: "The visitor's IP address.",
			example: "192.168.1.1",
		})
		.optional(),
	city: z
		.string()
		.openapi({
			description: "The visitor's city.",
			example: "San Francisco",
		})
		.optional(),
	region: z
		.string()
		.openapi({
			description: "The visitor's region/state.",
			example: "California",
		})
		.optional(),
	country: z
		.string()
		.openapi({
			description: "The visitor's country.",
			example: "United States",
		})
		.optional(),
	countryCode: z
		.string()
		.max(2)
		.openapi({
			description: "The visitor's country code (ISO 3166-1 alpha-2).",
			example: "US",
		})
		.optional(),
	latitude: z
		.number()
		.openapi({
			description: "The visitor's latitude.",
			example: 37.7749,
		})
		.optional(),
	longitude: z
		.number()
		.openapi({
			description: "The visitor's longitude.",
			example: -122.4194,
		})
		.optional(),
	language: z
		.string()
		.openapi({
			description: "The visitor's preferred language.",
			example: "en-US",
		})
		.optional(),
	timezone: z
		.string()
		.openapi({
			description: "The visitor's timezone.",
			example: "America/Los_Angeles",
		})
		.optional(),
	screenResolution: z
		.string()
		.openapi({
			description: "The visitor's screen resolution.",
			example: "1920x1080",
		})
		.optional(),
	viewport: z
		.string()
		.openapi({
			description: "The visitor's viewport size.",
			example: "1920x900",
		})
		.optional(),
	attribution: visitorAttributionSchema
		.openapi({
			description: "Normalized acquisition data captured for this visitor.",
		})
		.optional(),
	currentPage: visitorCurrentPageSchema
		.openapi({
			description: "Latest page context captured for this visitor.",
		})
		.optional(),
	metadata: visitorMetadataSchema
		.openapi({
			description: "Additional custom metadata for the visitor.",
			example: { plan: "premium", role: "admin" },
		})
		.optional(),
});

export type UpdateVisitorRequest = z.infer<typeof updateVisitorRequestSchema>;

export const updateVisitorMetadataRequestSchema = z.object({
	metadata: visitorMetadataSchema.openapi({
		description: "Metadata payload to merge into the visitor's profile.",
		example: { plan: "premium", role: "admin" },
	}),
});

export type UpdateVisitorMetadataRequest = z.infer<
	typeof updateVisitorMetadataRequestSchema
>;

export const visitorProfileSchema = z.object({
	id: z.ulid().openapi({
		description: "The visitor's unique identifier (ULID).",
		example: "01JG000000000000000000000",
	}),
	lastSeenAt: z.string().nullable().openapi({
		description: "When the visitor was last seen.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	blockedAt: z.string().nullable().openapi({
		description: "When the visitor was blocked, if applicable.",
		example: "2024-01-01T12:00:00.000Z",
	}),
	blockedByUserId: z.string().nullable().openapi({
		description: "Identifier of the team member who blocked the visitor.",
		example: "01JG000000000000000000001",
	}),
	isBlocked: z.boolean().openapi({
		description: "Whether the visitor is currently blocked.",
		example: true,
	}),
	contact: publicContactResponseSchema.nullable(),
});

/**
 * Visitor response schema
 */
export const visitorResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The visitor's unique identifier (ULID).",
		example: "01JG000000000000000000000",
	}),
	browser: z.string().nullable().openapi({
		description: "The visitor's browser.",
		example: "Chrome",
	}),
	browserVersion: z.string().nullable().openapi({
		description: "The visitor's browser version.",
		example: "120.0.0",
	}),
	os: z.string().nullable().openapi({
		description: "The visitor's operating system.",
		example: "Windows",
	}),
	osVersion: z.string().nullable().openapi({
		description: "The visitor's operating system version.",
		example: "11",
	}),
	device: z.string().nullable().openapi({
		description: "The visitor's device.",
		example: "MacBook Pro",
	}),
	deviceType: z.string().nullable().openapi({
		description: "The visitor's device type.",
		example: "desktop",
	}),
	ip: z.string().nullable().openapi({
		description: "The visitor's IP address.",
		example: "192.168.1.1",
	}),
	city: z.string().nullable().openapi({
		description: "The visitor's city.",
		example: "San Francisco",
	}),
	region: z.string().nullable().openapi({
		description: "The visitor's region/state.",
		example: "California",
	}),
	country: z.string().nullable().openapi({
		description: "The visitor's country.",
		example: "United States",
	}),
	countryCode: z.string().nullable().openapi({
		description: "The visitor's country code (ISO 3166-1 alpha-2).",
		example: "US",
	}),
	latitude: z.number().nullable().openapi({
		description: "The visitor's latitude.",
		example: 37.7749,
	}),
	longitude: z.number().nullable().openapi({
		description: "The visitor's longitude.",
		example: -122.4194,
	}),
	language: z.string().nullable().openapi({
		description: "The visitor's preferred language.",
		example: "en-US",
	}),
	timezone: z.string().nullable().openapi({
		description: "The visitor's timezone.",
		example: "America/Los_Angeles",
	}),
	screenResolution: z.string().nullable().openapi({
		description: "The visitor's screen resolution.",
		example: "1920x1080",
	}),
	viewport: z.string().nullable().openapi({
		description: "The visitor's viewport size.",
		example: "1920x900",
	}),
	createdAt: z.string().openapi({
		description: "When the visitor was first seen.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	updatedAt: z.string().openapi({
		description: "When the visitor record was last updated.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	lastSeenAt: z.string().nullable().openapi({
		description: "When the visitor was last connected or active.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	websiteId: z.ulid().openapi({
		description: "The website's unique identifier that the visitor belongs to.",
		example: "01JG000000000000000000000",
	}),
	organizationId: z.ulid().openapi({
		description:
			"The organization's unique identifier that the visitor belongs to.",
		example: "01JG000000000000000000000",
	}),
	blockedAt: z.string().nullable().openapi({
		description: "When the visitor was blocked, if applicable.",
		example: "2024-01-01T12:00:00.000Z",
	}),
	blockedByUserId: z.string().nullable().openapi({
		description: "Identifier of the team member who blocked the visitor.",
		example: "01JG000000000000000000001",
	}),
	isBlocked: z.boolean().openapi({
		description: "Whether the visitor is currently blocked.",
		example: true,
	}),
	attribution: visitorAttributionSchema.nullable().openapi({
		description: "Normalized acquisition data captured for this visitor.",
	}),
	currentPage: visitorCurrentPageSchema.nullable().openapi({
		description: "Latest page context captured for this visitor.",
	}),
	contact: contactResponseSchema.nullable(),
});

export type Visitor = z.infer<typeof visitorResponseSchema>;
export type VisitorResponse = Visitor;

/**
 * Visitor response schema
 */
export const publicVisitorResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The visitor's unique identifier (ULID).",
		example: "01JG000000000000000000000",
	}),
	isBlocked: z.boolean().openapi({
		description: "Whether the visitor is currently blocked.",
		example: false,
	}),
	language: z.string().nullable().openapi({
		description: "The visitor's preferred language.",
		example: "en-US",
	}),
	contact: publicContactResponseSchema.nullable().openapi({
		description:
			"Contact information if the visitor has been identified via .identify().",
		example: {
			id: "01JG000000000000000000000",
			name: "John Doe",
			email: "john.doe@example.com",
			image: "https://example.com/avatar.png",
		},
	}),
});

export type PublicVisitor = z.infer<typeof publicVisitorResponseSchema>;
export type PublicVisitorResponse = PublicVisitor;
