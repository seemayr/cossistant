import { describe, expect, it, mock } from "bun:test";
import {
	applyDevelopmentClientIpOverride,
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

	it("prefers x-forwarded-for over x-real-ip for the canonical Railway client IP", () => {
		const result = extractClientIp((name) => {
			switch (name) {
				case "x-forwarded-for":
					return "8.8.8.8, 44.44.44.44";
				case "x-real-ip":
					return "44.44.44.44";
				default:
					return null;
			}
		});

		expect(result.canonicalIp).toBe("8.8.8.8");
		expect(result.publicIp).toBe("8.8.8.8");
	});

	it("uses x-real-ip as a fallback when x-forwarded-for is missing", () => {
		const result = extractClientIp((name) =>
			name === "x-real-ip" ? "8.8.8.8" : null
		);

		expect(result.canonicalIp).toBe("8.8.8.8");
		expect(result.publicIp).toBe("8.8.8.8");
	});

	it("keeps the leftmost x-forwarded-for value as canonical and the first public one for lookups", () => {
		const result = extractClientIp((name) =>
			name === "x-forwarded-for" ? "10.0.0.3, 8.8.8.8, 1.1.1.1" : null
		);

		expect(result.canonicalIp).toBe("10.0.0.3");
		expect(result.publicIp).toBe("8.8.8.8");
	});

	it("uses the local development override when the request IP is private", () => {
		const result = applyDevelopmentClientIpOverride(
			{
				canonicalIp: "127.0.0.1",
				publicIp: null,
			},
			{
				nodeEnv: "development",
				overrideIp: "8.8.8.8",
			}
		);

		expect(result).toEqual({
			canonicalIp: "8.8.8.8",
			publicIp: "8.8.8.8",
		});
	});

	it("keeps the real public IP when one is already available", () => {
		const result = applyDevelopmentClientIpOverride(
			{
				canonicalIp: "8.8.4.4",
				publicIp: "8.8.4.4",
			},
			{
				nodeEnv: "development",
				overrideIp: "8.8.8.8",
			}
		);

		expect(result).toEqual({
			canonicalIp: "8.8.4.4",
			publicIp: "8.8.4.4",
		});
	});

	it("ignores invalid local overrides and warns in development", () => {
		const warn = mock(() => {});
		const result = applyDevelopmentClientIpOverride(
			{
				canonicalIp: "127.0.0.1",
				publicIp: null,
			},
			{
				nodeEnv: "development",
				overrideIp: "127.0.0.1",
				warn,
			}
		);

		expect(result).toEqual({
			canonicalIp: "127.0.0.1",
			publicIp: null,
		});
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("ignores the override outside development", () => {
		const result = applyDevelopmentClientIpOverride(
			{
				canonicalIp: "127.0.0.1",
				publicIp: null,
			},
			{
				nodeEnv: "production",
				overrideIp: "8.8.8.8",
			}
		);

		expect(result).toEqual({
			canonicalIp: "127.0.0.1",
			publicIp: null,
		});
	});
});
