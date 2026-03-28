import { env } from "@api/env";
import { getRateLimitStore } from "@api/lib/rate-limit-store";
import { extractClientIpFromRequest } from "@api/utils/client-ip";
import type { Context, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";

const isDevelopment = env.NODE_ENV !== "production";

/**
 * Default rate limiter for general API endpoints
 * Allows 300 requests per minute per IP in development
 * Allows 100 requests per minute per IP in production
 */
export const defaultRateLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minute
	limit: isDevelopment ? 300 : 100,
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		return ip;
	},
	store: getRateLimitStore(),
	message: "Too many requests, please try again later.",
	skip: (c: Context) => {
		// Skip rate limiting for health checks
		return c.req.path === "/health";
	},
});

/**
 * Strict rate limiter for authentication endpoints
 * Allows 5 requests per minute per IP
 */
export const authRateLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minute
	limit: 30, // 5 requests per minute
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		return `auth:${ip}`;
	},
	store: getRateLimitStore(),
	message: "Too many authentication attempts, please try again later.",
});

/**
 * Rate limiter for TRPC endpoints
 * Allows 200 requests per minute per IP in development (more forgiving)
 * Allows 100 requests per minute per IP in production
 */
export const trpcRateLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minute
	limit: isDevelopment ? 200 : 100, // More forgiving in development
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		return `trpc:${ip}`;
	},
	store: getRateLimitStore(),
	message: {
		error: "Too many requests",
		code: "TOO_MANY_REQUESTS",
		message: "Rate limit exceeded. Please try again later.",
	},
});

/**
 * Rate limiter for WebSocket connections
 * Allows 30 connections per minute per IP in development
 * Allows 10 connections per minute per IP in production
 */
export const websocketRateLimiter = rateLimiter({
	windowMs: 60 * 1000, // 1 minute
	limit: isDevelopment ? 30 : 10,
	standardHeaders: "draft-6",
	keyGenerator: (c: Context) => {
		const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
		return `ws:${ip}`;
	},
	store: getRateLimitStore(),
	message: "Too many WebSocket connection attempts, please try again later.",
});

/**
 * Custom rate limiter factory for specific endpoints
 */
export function createCustomRateLimiter(options: {
	windowMs?: number;
	limit: number;
	keyPrefix?: string;
	message?: string | Record<string, unknown>;
}) {
	return rateLimiter({
		windowMs: options.windowMs || 60 * 1000, // Default 1 minute
		limit: options.limit,
		standardHeaders: "draft-6",
		keyGenerator: (c: Context) => {
			const ip = extractClientIpFromRequest(c.req).canonicalIp || "unknown";
			return options.keyPrefix ? `${options.keyPrefix}:${ip}` : ip;
		},
		store: getRateLimitStore(),
		message: options.message || "Too many requests, please try again later.",
	});
}
