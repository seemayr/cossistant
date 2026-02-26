import { describe, expect, it } from "bun:test";
import { mergeVisitorPresenceRows } from "./use-visitor-presence";

describe("mergeVisitorPresenceRows", () => {
	it("classifies online and away rows when status is missing", () => {
		const nowMs = Date.parse("2026-02-25T12:00:00.000Z");

		const result = mergeVisitorPresenceRows({
			nowMs,
			rows: [
				{
					visitor_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
					status: null,
					last_seen_at: "2026-02-25T11:59:30.000Z",
					name: null,
					image: null,
					city: null,
					country_code: null,
					latitude: null,
					longitude: null,
				},
				{
					visitor_id: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
					status: null,
					last_seen_at: "2026-02-25T11:45:00.000Z",
					name: null,
					image: null,
					city: null,
					country_code: null,
					latitude: null,
					longitude: null,
				},
			],
		});

		expect(result.visitors[0]?.status).toBe("online");
		expect(result.visitors[1]?.status).toBe("away");
		expect(result.totals).toEqual({ online: 1, away: 1 });
	});

	it("applies fallback precedence and keeps newest first", () => {
		const result = mergeVisitorPresenceRows({
			rows: [
				{
					visitor_id: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
					status: "away",
					last_seen_at: "2026-02-25T11:40:00.000Z",
					name: "",
					image: "",
					city: "",
					country_code: null,
					latitude: null,
					longitude: null,
				},
				{
					visitor_id: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
					status: "online",
					last_seen_at: "2026-02-25T11:59:00.000Z",
					name: "Tinybird Name",
					image: "https://img.example/tinybird.png",
					city: "Paris",
					country_code: "FR",
					latitude: 48.8566,
					longitude: 2.3522,
				},
			],
			profilesByVisitorId: {
				"01ARZ3NDEKTSV4RRFFQ69G5FAX": {
					id: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
					lastSeenAt: "2026-02-25T11:39:00.000Z",
					city: "Lyon",
					region: "Auvergne-Rhone-Alpes",
					country: "France",
					latitude: 45.764,
					longitude: 4.8357,
					contactId: "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
					contactName: "Profile Name",
					contactEmail: "profile@example.com",
					contactImage: "https://img.example/profile.png",
				},
				"01ARZ3NDEKTSV4RRFFQ69G5FAY": {
					id: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
					lastSeenAt: "2026-02-25T11:58:00.000Z",
					city: "Marseille",
					region: "Provence-Alpes-Cote d'Azur",
					country: "France",
					latitude: 43.2965,
					longitude: 5.3698,
					contactId: null,
					contactName: "Fallback Name",
					contactEmail: null,
					contactImage: "https://img.example/fallback.png",
				},
			},
		});

		expect(result.visitors[0]?.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAY");
		expect(result.visitors[1]?.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAX");

		expect(result.visitors[0]).toMatchObject({
			name: "Tinybird Name",
			image: "https://img.example/tinybird.png",
			city: "Paris",
			latitude: 48.8566,
			longitude: 2.3522,
			country: "France",
		});

		expect(result.visitors[1]).toMatchObject({
			name: "Profile Name",
			email: "profile@example.com",
			image: "https://img.example/profile.png",
			city: "Lyon",
			region: "Auvergne-Rhone-Alpes",
			country: "France",
			latitude: 45.764,
			longitude: 4.8357,
			contactId: "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
		});
	});
});
