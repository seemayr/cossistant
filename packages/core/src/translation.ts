import type { Conversation } from "@cossistant/types";
import type {
	TimelineItem,
	TimelinePartTranslation,
} from "@cossistant/types/api/timeline-item";

export type TranslationAudience = "team" | "visitor";

function safeNormalizeTag(language: string): string {
	const candidate = language.trim().replace(/_/g, "-");

	try {
		if (typeof Intl.Locale !== "undefined") {
			return new Intl.Locale(candidate).toString();
		}
	} catch {
		// Ignore and fall back to a simpler normalization path below.
	}

	return candidate;
}

export function normalizeLanguageTag(
	language: string | null | undefined
): string | null {
	if (!language) {
		return null;
	}

	const normalized = safeNormalizeTag(language);
	return normalized ? normalized.toLowerCase() : null;
}

export function getPrimaryLanguageTag(
	language: string | null | undefined
): string | null {
	const normalized = normalizeLanguageTag(language);
	if (!normalized) {
		return null;
	}

	const [primary] = normalized.split("-");
	return primary || null;
}

export function areLanguagesEquivalent(
	left: string | null | undefined,
	right: string | null | undefined
): boolean {
	const leftPrimary = getPrimaryLanguageTag(left);
	const rightPrimary = getPrimaryLanguageTag(right);

	if (!(leftPrimary && rightPrimary)) {
		return false;
	}

	return leftPrimary === rightPrimary;
}

export function shouldTranslateBetweenLanguages(
	sourceLanguage: string | null | undefined,
	targetLanguage: string | null | undefined
): boolean {
	if (!(sourceLanguage && targetLanguage)) {
		return false;
	}

	return !areLanguagesEquivalent(sourceLanguage, targetLanguage);
}

export function isTimelinePartTranslation(
	part: unknown
): part is TimelinePartTranslation {
	if (!(part && typeof part === "object")) {
		return false;
	}

	return (
		"type" in part &&
		part.type === "translation" &&
		"text" in part &&
		typeof part.text === "string" &&
		"audience" in part &&
		(part.audience === "team" || part.audience === "visitor")
	);
}

export function getTimelineItemTranslation(
	item: Pick<TimelineItem, "parts">,
	audience: TranslationAudience
): TimelinePartTranslation | null {
	for (let index = item.parts.length - 1; index >= 0; index--) {
		const part = item.parts[index];
		if (isTimelinePartTranslation(part) && part.audience === audience) {
			return part;
		}
	}

	return null;
}

export function resolveTimelineItemText(
	item: Pick<TimelineItem, "text" | "parts">,
	audience: TranslationAudience
): string | null {
	return getTimelineItemTranslation(item, audience)?.text ?? item.text ?? null;
}

export function resolveConversationTitle(
	conversation: Pick<Conversation, "title" | "visitorTitle">,
	audience: TranslationAudience
): string | undefined {
	if (audience === "visitor") {
		const visitorTitle = conversation.visitorTitle?.trim();
		if (visitorTitle) {
			return visitorTitle;
		}
	}

	const title = conversation.title?.trim();
	return title || undefined;
}
