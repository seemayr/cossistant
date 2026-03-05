import { isRecord } from "../internal/guards";

export { isRecord } from "../internal/guards";

const MAX_SANITIZE_DEPTH = 4;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;
const MAX_SERIALIZED_LENGTH = 6000;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const BEARER_PATTERN = /bearer\s+[A-Za-z0-9._-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;

function redactString(value: string): string {
	return value
		.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
		.replace(PHONE_PATTERN, "[REDACTED_PHONE]")
		.replace(BEARER_PATTERN, "[REDACTED_BEARER_TOKEN]")
		.replace(JWT_PATTERN, "[REDACTED_JWT]");
}

function truncateString(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function isSensitiveKey(key: string): boolean {
	const normalizedKey = key.toLowerCase();
	const sensitiveKeywords = [
		"token",
		"secret",
		"password",
		"pass",
		"apikey",
		"api_key",
		"authorization",
		"auth",
		"cookie",
		"session",
		"email",
		"phone",
	];

	return sensitiveKeywords.some((keyword) => normalizedKey.includes(keyword));
}

function sanitizeToolDebugValueInternal(
	value: unknown,
	depth: number,
	seen: WeakSet<object>
): unknown {
	if (
		value === null ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (typeof value === "string") {
		return truncateString(redactString(value), MAX_STRING_LENGTH);
	}

	if (typeof value === "undefined") {
		return "[Undefined]";
	}

	if (typeof value === "bigint") {
		return value.toString();
	}

	if (typeof value === "function") {
		return "[Function]";
	}

	if (depth >= MAX_SANITIZE_DEPTH) {
		return "[MaxDepthExceeded]";
	}

	if (Array.isArray(value)) {
		const sanitizedItems = value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => sanitizeToolDebugValueInternal(item, depth + 1, seen));

		if (value.length > MAX_ARRAY_ITEMS) {
			sanitizedItems.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`);
		}

		return sanitizedItems;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "object") {
		if (seen.has(value)) {
			return "[Circular]";
		}

		seen.add(value);

		const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
		const sanitized: Record<string, unknown> = {};

		for (const [key, nestedValue] of entries) {
			if (isSensitiveKey(key)) {
				sanitized[key] = "[REDACTED]";
				continue;
			}

			sanitized[key] = sanitizeToolDebugValueInternal(
				nestedValue,
				depth + 1,
				seen
			);
		}

		if (Object.keys(value).length > MAX_OBJECT_KEYS) {
			sanitized.__truncatedKeys = Object.keys(value).length - MAX_OBJECT_KEYS;
		}

		return sanitized;
	}

	return String(value);
}

function limitSerializedSize(value: unknown): unknown {
	try {
		const serialized = JSON.stringify(value);
		if (!serialized || serialized.length <= MAX_SERIALIZED_LENGTH) {
			return value;
		}

		return {
			truncated: true,
			size: serialized.length,
			preview: `${serialized.slice(0, MAX_SERIALIZED_LENGTH)}...`,
		};
	} catch {
		return "[UnserializableValue]";
	}
}

export function sanitizeToolDebugValue(value: unknown): unknown {
	return limitSerializedSize(
		sanitizeToolDebugValueInternal(value, 0, new WeakSet<object>())
	);
}

export function sanitizeToolInputDefault(
	input: unknown
): Record<string, unknown> {
	if (isRecord(input)) {
		return sanitizeToolDebugValue(input) as Record<string, unknown>;
	}

	return {
		value: sanitizeToolDebugValue(input),
	};
}

export function toErrorText(error: unknown): string {
	if (typeof error === "string") {
		return truncateString(redactString(error), MAX_STRING_LENGTH);
	}

	if (error instanceof Error) {
		return truncateString(redactString(error.message), MAX_STRING_LENGTH);
	}

	return "Tool execution failed";
}
