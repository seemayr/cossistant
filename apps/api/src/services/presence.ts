import { trackPresence } from "@api/lib/tinybird-sdk";

export async function markVisitorPresence(params: {
	websiteId: string;
	visitorId: string;
	lastSeenAt: string | number | Date;
	sessionId?: string;
	name?: string;
	image?: string;
	geo?: {
		countryCode?: string;
		city?: string;
		latitude?: number;
		longitude?: number;
	};
}): Promise<void> {
	try {
		// Keep API signature stable while live presence backends remain optional.
		void params.lastSeenAt;
		void params.sessionId;

		trackPresence({
			website_id: params.websiteId,
			entity_id: params.visitorId,
			entity_type: "visitor",
			name: params.name,
			image: params.image,
			country_code: params.geo?.countryCode,
			city: params.geo?.city,
			latitude: params.geo?.latitude,
			longitude: params.geo?.longitude,
		});
	} catch (error) {
		console.error("[Presence] Failed to mark visitor presence", {
			websiteId: params.websiteId,
			visitorId: params.visitorId,
			error,
		});
	}
}

export async function markUserPresence(params: {
	websiteId: string;
	userId: string;
	lastSeenAt: string | number | Date;
	name?: string;
	image?: string;
	geo?: {
		countryCode?: string;
		city?: string;
		latitude?: number;
		longitude?: number;
	};
}): Promise<void> {
	try {
		// Keep API signature stable while live presence backends remain optional.
		void params.lastSeenAt;

		trackPresence({
			website_id: params.websiteId,
			entity_id: params.userId,
			entity_type: "user",
			name: params.name,
			image: params.image,
			country_code: params.geo?.countryCode,
			city: params.geo?.city,
			latitude: params.geo?.latitude,
			longitude: params.geo?.longitude,
		});
	} catch (error) {
		console.error("[Presence] Failed to mark user presence", {
			websiteId: params.websiteId,
			userId: params.userId,
			error,
		});
	}
}
