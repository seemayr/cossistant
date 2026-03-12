import {
	getContactForVisitor,
	mergeContactMetadata,
} from "@api/db/queries/contact";
import type { VisitorRecord } from "@api/db/queries/visitor";
import {
	findVisitorForWebsite,
	updateVisitorForWebsite,
} from "@api/db/queries/visitor";
import { trackVisitorEvent } from "@api/lib/tinybird-sdk";
import {
	flattenVisitorTrackingContext,
	resolveFirstTouchAttribution,
} from "@api/lib/visitor-attribution";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import { resolveCountryDetails } from "@cossistant/location/country-utils";
import {
	type UpdateVisitorRequest,
	updateVisitorMetadataRequestSchema,
	updateVisitorRequestSchema,
	type VisitorResponse,
	visitorResponseSchema,
} from "@cossistant/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { z } from "zod";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import type { RestContext } from "../types";

export const visitorRouter = new OpenAPIHono<RestContext>();
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

function formatVisitorResponse(record: VisitorRecord): VisitorResponse {
	return {
		id: record.id,
		browser: record.browser,
		browserVersion: record.browserVersion,
		os: record.os,
		osVersion: record.osVersion,
		device: record.device,
		deviceType: record.deviceType,
		ip: record.ip,
		city: record.city,
		region: record.region,
		country: record.country,
		countryCode: record.countryCode,
		latitude: record.latitude,
		longitude: record.longitude,
		language: record.language,
		timezone: record.timezone,
		screenResolution: record.screenResolution,
		viewport: record.viewport,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		lastSeenAt: record.lastSeenAt ?? null,
		websiteId: record.websiteId,
		organizationId: record.organizationId,
		blockedAt: record.blockedAt ?? null,
		blockedByUserId: record.blockedByUserId,
		isBlocked: Boolean(record.blockedAt),
		attribution: record.attribution ?? null,
		currentPage: record.currentPage ?? null,
		contact: null,
	};
}

function getHeaderValue(
	request: Context<RestContext>["req"],
	name: string
): string | null {
	return request.header(name) ?? null;
}

function pickFirstHeader(values: Array<string | null>): string | null {
	return values.find((value) => value && value.trim().length > 0) ?? null;
}

function parsePreferredLocale(headerValue: string | null): string | null {
	if (!headerValue) {
		return null;
	}
	return headerValue.split(",").at(0) ?? null;
}

function normalizeCountryCode(code?: string | null): string | null {
	if (!code) {
		return null;
	}
	const trimmed = code.trim();
	if (trimmed.length !== 2) {
		return null;
	}
	const normalizedCode = trimmed.toUpperCase();
	return COUNTRY_CODE_REGEX.test(normalizedCode) ? normalizedCode : null;
}

// RFC 7239 Forwarded header can contain multiple comma-separated entries. Each entry can
// hold a `for=` directive that may include quotes, IPv6 brackets, or port information.
function parseForwardedHeader(headerValue: string | null): string | null {
	if (!headerValue) {
		return null;
	}

	for (const segment of headerValue.split(",")) {
		const forDirective = segment
			.split(";")
			.map((part) => part.trim())
			.find((part) => part.toLowerCase().startsWith("for="));

		if (!forDirective) {
			continue;
		}

		let value = forDirective.slice(4).trim();

		if (value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1);
		}

		if (value.startsWith("[")) {
			const closingBracketIndex = value.indexOf("]");
			if (closingBracketIndex !== -1) {
				value = value.slice(1, closingBracketIndex);
			}
		} else {
			const colonIndex = value.indexOf(":");
			if (colonIndex !== -1 && !value.includes("::")) {
				value = value.slice(0, colonIndex);
			}
		}

		if (value.length > 0) {
			return value;
		}
	}

	return null;
}

function parseCoordinate(value: string | null): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function inferCityFromTimezoneHeader(timezone: string | null): string | null {
	if (!timezone?.includes("/")) {
		return null;
	}
	const [, city] = timezone.split("/");
	return city ? city.replace(/_/g, " ") : null;
}

function setIfPresent<T extends keyof UpdateVisitorRequest>(
	target: Partial<UpdateVisitorRequest>,
	key: T,
	value: UpdateVisitorRequest[T] | null | undefined
): void {
	if (value !== null && value !== undefined) {
		target[key] = value;
	}
}

function getEdgeIp(request: Context<RestContext>["req"]): string | null {
	const header = (name: string) => getHeaderValue(request, name);
	const forwardedFor = header("x-forwarded-for");
	const primaryForwarded = forwardedFor?.split(",").at(0)?.trim() ?? null;
	return pickFirstHeader([
		header("cf-connecting-ip"),
		header("x-real-ip"),
		header("x-client-ip"),
		header("fastly-client-ip"),
		header("true-client-ip"),
		header("x-cluster-client-ip"),
		parseForwardedHeader(header("forwarded")),
		primaryForwarded,
	]);
}

function getEdgeLocation(request: Context<RestContext>["req"]): {
	city: string | null;
	region: string | null;
	countryCode: string | null;
} {
	const header = (name: string) => getHeaderValue(request, name);
	return {
		city: pickFirstHeader([header("cf-ipcity"), header("x-vercel-ip-city")]),
		region: pickFirstHeader([
			header("cf-ipregion"),
			header("x-vercel-ip-country-region"),
		]),
		countryCode: pickFirstHeader([
			header("cf-ipcountry"),
			header("x-vercel-ip-country"),
		]),
	};
}

function getEdgeCoordinates(request: Context<RestContext>["req"]): {
	latitude: number | null;
	longitude: number | null;
} {
	const latitudeSource = pickFirstHeader([
		getHeaderValue(request, "cf-iplatitude"),
		getHeaderValue(request, "x-vercel-ip-latitude"),
	]);
	const longitudeSource = pickFirstHeader([
		getHeaderValue(request, "cf-iplongitude"),
		getHeaderValue(request, "x-vercel-ip-longitude"),
	]);
	return {
		latitude: parseCoordinate(latitudeSource),
		longitude: parseCoordinate(longitudeSource),
	};
}

function extractNetworkContext(request: Context<RestContext>["req"]): {
	context: Partial<UpdateVisitorRequest>;
	preferredLocale: string | null;
	timezone: string | null;
} {
	const header = (name: string) => getHeaderValue(request, name);

	const ip = getEdgeIp(request);
	const { city, region, countryCode } = getEdgeLocation(request);
	const { latitude, longitude } = getEdgeCoordinates(request);
	const preferredLocale = parsePreferredLocale(header("accept-language"));
	const timezoneHeader = header("x-vercel-ip-timezone");

	const networkContext: Partial<UpdateVisitorRequest> = {};

	setIfPresent(networkContext, "ip", ip);
	setIfPresent(networkContext, "city", city);
	setIfPresent(networkContext, "region", region);
	setIfPresent(networkContext, "timezone", timezoneHeader);

	const normalizedEdgeCountryCode = normalizeCountryCode(countryCode);
	if (normalizedEdgeCountryCode) {
		networkContext.countryCode = normalizedEdgeCountryCode;
	}
	// Country name is only reliable when provided by edge headers.
	// Attempt a display name when a code exists to enrich analytics, but avoid guesses otherwise.
	if (normalizedEdgeCountryCode && typeof Intl.DisplayNames !== "undefined") {
		try {
			const display = new Intl.DisplayNames([preferredLocale || "en"], {
				type: "region",
			});
			networkContext.country =
				display.of(normalizedEdgeCountryCode) ?? networkContext.country;
		} catch (_error) {
			// Ignore failures silently
		}
	}

	setIfPresent(networkContext, "latitude", latitude);
	setIfPresent(networkContext, "longitude", longitude);

	if (!networkContext.language && preferredLocale) {
		networkContext.language = preferredLocale;
	}

	if (!networkContext.city) {
		const inferredCity = inferCityFromTimezoneHeader(timezoneHeader);
		setIfPresent(networkContext, "city", inferredCity);
		if (networkContext.region === undefined || networkContext.region === null) {
			setIfPresent(networkContext, "region", inferredCity);
		}
	}
	return {
		context: networkContext,
		preferredLocale,
		timezone: timezoneHeader,
	};
}

visitorRouter.use("/*", ...protectedPublicApiKeyMiddleware);

// PATCH /visitors/:id - Update existing visitor information
visitorRouter.openapi(
	{
		method: "patch",
		path: "/:id",
		summary: "Update existing visitor information",
		description:
			"Updates an existing visitor's browser, device, and location data. The visitor must already exist in the system.",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The visitor ID to update",
				schema: {
					type: "string",
				},
			},
		],
		request: {
			body: {
				content: {
					"application/json": {
						schema: updateVisitorRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: visitorResponseSchema,
					},
				},
				description: "Visitor information successfully created or updated",
			},
			400: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Invalid request data",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Visitor not found",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				updateVisitorRequestSchema
			);
			const visitorId = c.req.param("id");

			if (!visitorId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Visitor not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const existingVisitor = await findVisitorForWebsite(db, {
				visitorId,
				websiteId: website.id,
			});

			if (!existingVisitor) {
				return c.json(
					{ error: "NOT_FOUND", message: "Visitor not found" },
					404
				);
			}

			const normalizedBodyCountryCode = normalizeCountryCode(body.countryCode);
			if (
				typeof body.countryCode === "string" &&
				normalizedBodyCountryCode === null
			) {
				return c.json(
					{
						error: "BAD_REQUEST",
						message: "countryCode must be a valid ISO 3166-1 alpha-2 code",
					},
					400
				);
			}

			const normalizedBody: UpdateVisitorRequest = {
				...body,
				...(normalizedBodyCountryCode
					? { countryCode: normalizedBodyCountryCode }
					: {}),
				attribution: body.attribution,
				currentPage: body.currentPage,
			};

			const now = new Date();
			const {
				context: networkContext,
				preferredLocale,
				timezone: timezoneFromHeaders,
			} = extractNetworkContext(c.req);

			const isCountryStringInBody = typeof body.country === "string";
			const hasCountryInBody =
				isCountryStringInBody && body.country && body.country.trim().length > 0;

			const hasCountryCodeInBody = normalizedBodyCountryCode !== null;

			const localeCandidate =
				normalizedBody.language ?? networkContext.language ?? preferredLocale;
			const timezoneCandidate =
				normalizedBody.timezone ??
				networkContext.timezone ??
				timezoneFromHeaders;
			const cityCandidate = normalizedBody.city ?? networkContext.city ?? null;

			const countryDetails = resolveCountryDetails({
				country: normalizedBody.country ?? networkContext.country ?? null,
				countryCode:
					normalizedBodyCountryCode ?? networkContext.countryCode ?? null,
				locale: localeCandidate ?? null,
				timezone: timezoneCandidate ?? null,
				city: cityCandidate,
			});
			const normalizedDerivedCountryCode = normalizeCountryCode(
				countryDetails.code
			);

			const derivedCountryUpdate: Partial<UpdateVisitorRequest> = {};

			if (hasCountryCodeInBody) {
				// Country code already provided in request body
			} else if (networkContext.countryCode) {
				// Country code already available from network context
			} else if (normalizedDerivedCountryCode) {
				derivedCountryUpdate.countryCode = normalizedDerivedCountryCode;
			}

			if (hasCountryInBody) {
				// Country name already provided in request body
			} else if (networkContext.country) {
				// Country name already available from network context
			} else if (countryDetails.name) {
				derivedCountryUpdate.country = countryDetails.name;
			}

			const updatedVisitor = await updateVisitorForWebsite(db, {
				visitorId,
				websiteId: website.id,
				data: {
					...networkContext,
					...normalizedBody,
					...derivedCountryUpdate,
					attribution: resolveFirstTouchAttribution({
						existingAttribution: existingVisitor.attribution,
						incomingAttribution: normalizedBody.attribution,
					}),
					currentPage:
						normalizedBody.currentPage ?? existingVisitor.currentPage,
					lastSeenAt: now.toISOString(),
					updatedAt: now.toISOString(),
				},
			});

			if (!updatedVisitor) {
				return c.json(
					{ error: "NOT_FOUND", message: "Visitor not found" },
					404
				);
			}

			if (normalizedBody.currentPage) {
				trackVisitorEvent({
					website_id: website.id,
					visitor_id: visitorId,
					event_type: "page_view",
					...flattenVisitorTrackingContext({
						attribution: updatedVisitor.attribution,
						currentPage: updatedVisitor.currentPage,
					}),
				});
			}

			const response = formatVisitorResponse(updatedVisitor);

			return c.json(validateResponse(response, visitorResponseSchema), 200);
		} catch (error) {
			console.error("Error updating visitor:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to update visitor information",
				},
				500
			);
		}
	}
);

// PATCH /visitors/:id/metadata - Update contact metadata for a visitor
visitorRouter.openapi(
	{
		method: "patch",
		path: "/:id/metadata",
		summary: "Update contact metadata for a visitor",
		description:
			"Merges the provided metadata into the contact profile associated with the visitor. The visitor must be identified first (linked to a contact) via the /contacts/identify endpoint.",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The visitor ID",
				schema: {
					type: "string",
				},
			},
		],
		request: {
			body: {
				content: {
					"application/json": {
						schema: updateVisitorMetadataRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "Contact metadata updated successfully",
				content: {
					"application/json": {
						schema: visitorResponseSchema,
					},
				},
			},
			400: {
				description: "Invalid request data or visitor not identified",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			401: {
				description: "Unauthorized - Invalid API key",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			404: {
				description: "Visitor not found",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website, body } = await safelyExtractRequestData(
				c,
				updateVisitorMetadataRequestSchema
			);
			const visitorId = c.req.param("id");

			if (!visitorId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Visitor not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			// Get the contact associated with this visitor
			const contact = await getContactForVisitor(db, {
				visitorId,
				websiteId: website.id,
			});

			if (!contact) {
				return c.json(
					{
						error: "BAD_REQUEST",
						message:
							"Visitor is not identified. Please use the /contacts/identify endpoint first to create a contact for this visitor.",
					},
					400
				);
			}

			// Update the contact metadata
			await mergeContactMetadata(db, {
				contactId: contact.id,
				websiteId: website.id,
				metadata: body.metadata,
			});

			// Return the visitor response for backward compatibility
			const visitor = await findVisitorForWebsite(db, {
				visitorId,
				websiteId: website.id,
			});

			if (!visitor) {
				return c.json(
					{ error: "NOT_FOUND", message: "Visitor not found" },
					404
				);
			}

			const response = formatVisitorResponse(visitor);

			return c.json(validateResponse(response, visitorResponseSchema), 200);
		} catch (error) {
			console.error("Error updating contact metadata:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to update contact metadata",
				},
				500
			);
		}
	}
);

// GET /visitors/:id - Get visitor information by ID
visitorRouter.openapi(
	{
		method: "get",
		path: "/:id",
		summary: "Get visitor information",
		description: "Retrieves visitor information by visitor ID",
		inputSchema: [
			{
				name: "id",
				in: "path",
				required: true,
				description: "The visitor ID",
				schema: {
					type: "string",
				},
			},
		],
		responses: {
			200: {
				content: {
					"application/json": {
						schema: visitorResponseSchema,
					},
				},
				description: "Visitor information retrieved successfully",
			},
			404: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Visitor not found",
			},
			401: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Unauthorized - Invalid API key",
			},
			500: {
				content: {
					"application/json": {
						schema: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
				description: "Internal server error",
			},
		},
		security: [
			{
				"Public API Key": [],
			},
		],
	},
	async (c) => {
		try {
			const { db, website } = await safelyExtractRequestData(c);
			const visitorId = c.req.param("id");

			if (!visitorId) {
				return c.json(
					{ error: "NOT_FOUND", message: "Visitor not found" },
					404
				);
			}

			if (!website?.id) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "Invalid API key" },
					401
				);
			}

			const visitorRecord = await findVisitorForWebsite(db, {
				visitorId,
				websiteId: website.id,
			});

			if (!visitorRecord) {
				return c.json(
					{ error: "NOT_FOUND", message: "Visitor not found" },
					404
				);
			}

			const response = formatVisitorResponse(visitorRecord);

			return c.json(validateResponse(response, visitorResponseSchema), 200);
		} catch (error) {
			console.error("Error fetching visitor:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch visitor information",
				},
				500
			);
		}
	}
);
