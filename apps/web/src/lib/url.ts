import { ConversationStatus } from "@cossistant/types";
import type { InboxView } from "@cossistant/types/schemas";

export function getAPIBaseUrl(path: `/${string}`) {
	const baseUrl =
		process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8787";
	return `${baseUrl}/api${path}`;
}

export function getTRPCUrl() {
	const baseUrl =
		process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8787";
	return `${baseUrl}/trpc`;
}

const HTTP_REGEX = /^http/;

export function getWebSocketUrl() {
	const baseUrl =
		process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8787";
	return `${baseUrl.replace(HTTP_REGEX, "ws")}/ws`;
}

export function getLandingBaseUrl() {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	return baseUrl;
}

export function extractInboxParamsFromSlug({
	slug,
	availableViews,
	websiteSlug,
}: {
	slug: string[];
	availableViews: InboxView[];
	websiteSlug: string;
}): {
	selectedViewId: string | null;
	selectedConversationStatus: ConversationStatus | "archived" | null;
	selectedConversationId: string | null;
	basePath: string;
} {
	const selectedViewId: string | null = null;
	const basePath = `/${slug.join("/")}`;

	const selectedConversationStatus: ConversationStatus | "archived" | null =
		slug?.find(
			(segment) =>
				segment === "archived" ||
				segment === ConversationStatus.OPEN ||
				segment === ConversationStatus.RESOLVED ||
				segment === ConversationStatus.SPAM
		) ?? null;

	// If within the slug array a string starts with "CO", then it is a conversation id
	const selectedConversationId =
		slug?.find((segment) => segment.startsWith("CO")) ?? null;

	if (!slug || slug.length === 0) {
		return {
			selectedViewId: null,
			selectedConversationStatus,
			selectedConversationId: null,
			basePath,
		};
	}

	if (slug.length === 1 && selectedConversationId) {
		return {
			selectedViewId,
			selectedConversationStatus,
			selectedConversationId,
			basePath,
		};
	}

	return {
		selectedViewId,
		selectedConversationStatus,
		selectedConversationId,
		basePath,
	};
}
