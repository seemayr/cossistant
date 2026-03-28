import { describe, expect, it } from "bun:test";
import {
	extractClientIp,
	normalizeIpCandidate,
	parseForwardedHeader,
} from "./client-ip";

describe("client IP helpers", () => {
	it("normalizes IPv4 values with ports", () => {
		expect(normalizeIpCandidate("203.0.113.9:443")).toBe("203.0.113.9");
	});

	it("parses RFC 7239 Forwarded headers", () => {
		expect(
			parseForwardedHeader('for="[2001:db8:cafe::17]:4711";proto=https')
		).toBe("2001:db8:cafe::17");
	});

	it("prefers x-real-ip over x-forwarded-for for the canonical client IP", () => {
		const result = extractClientIp((name) => {
			switch (name) {
				case "x-real-ip":
					return "8.8.8.8";
				case "x-forwarded-for":
					return "1.1.1.1, 2.2.2.2";
				default:
					return null;
			}
		});

		expect(result.canonicalIp).toBe("8.8.8.8");
		expect(result.publicIp).toBe("8.8.8.8");
	});

	it("uses the first public x-forwarded-for value when earlier hops are private", () => {
		const result = extractClientIp((name) =>
			name === "x-forwarded-for" ? "10.0.0.3, 8.8.8.8, 1.1.1.1" : null
		);

		expect(result.canonicalIp).toBe("8.8.8.8");
		expect(result.publicIp).toBe("8.8.8.8");
	});
});
