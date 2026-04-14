import { getPrimaryLanguageTag, normalizeLanguageTag } from "@cossistant/core";

export type LanguageOption = {
	value: string;
	label: string;
	isPopular: boolean;
	searchText: string;
};

export const POPULAR_LANGUAGE_CODES = [
	"en",
	"es",
	"fr",
	"de",
	"pt",
	"zh",
	"ja",
	"ko",
	"ar",
	"hi",
] as const;

const LANGUAGE_CODES = [
	...POPULAR_LANGUAGE_CODES,
	"af",
	"am",
	"az",
	"be",
	"bg",
	"bn",
	"bs",
	"ca",
	"cs",
	"cy",
	"da",
	"el",
	"et",
	"eu",
	"fa",
	"fi",
	"fil",
	"ga",
	"gl",
	"gu",
	"he",
	"hr",
	"hu",
	"hy",
	"id",
	"is",
	"it",
	"ka",
	"kk",
	"km",
	"kn",
	"ky",
	"lo",
	"lt",
	"lv",
	"mk",
	"ml",
	"mn",
	"mr",
	"ms",
	"my",
	"ne",
	"nl",
	"no",
	"pa",
	"pl",
	"ps",
	"ro",
	"ru",
	"si",
	"sk",
	"sl",
	"sq",
	"sr",
	"sv",
	"sw",
	"ta",
	"te",
	"th",
	"tr",
	"uk",
	"ur",
	"uz",
	"vi",
	"zu",
];

const displayNames =
	typeof Intl.DisplayNames !== "undefined"
		? new Intl.DisplayNames(["en"], { type: "language" })
		: null;

const popularLanguageCodeSet = new Set<string>(POPULAR_LANGUAGE_CODES);
const popularLanguageCodeOrder = new Map<string, number>(
	POPULAR_LANGUAGE_CODES.map((code, index) => [code, index] as const)
);

function resolveLanguageOptionLabel(languageCode: string) {
	const label = displayNames?.of(languageCode);

	if (!(label && label !== languageCode)) {
		return languageCode;
	}

	return label;
}

function compareLanguageOptions(left: LanguageOption, right: LanguageOption) {
	if (left.isPopular && right.isPopular) {
		return (
			(popularLanguageCodeOrder.get(left.value) ?? 0) -
			(popularLanguageCodeOrder.get(right.value) ?? 0)
		);
	}

	if (left.isPopular) {
		return -1;
	}

	if (right.isPopular) {
		return 1;
	}

	return left.label.localeCompare(right.label, "en", {
		sensitivity: "base",
	});
}

function buildLanguageOptions() {
	const uniqueCodes = Array.from(new Set(LANGUAGE_CODES));

	return uniqueCodes
		.map((languageCode) => {
			const label = resolveLanguageOptionLabel(languageCode);

			return {
				value: languageCode,
				label,
				isPopular: popularLanguageCodeSet.has(languageCode),
				searchText: `${label} ${languageCode}`.toLowerCase(),
			} satisfies LanguageOption;
		})
		.sort(compareLanguageOptions);
}

const languageOptions = buildLanguageOptions();
const languageOptionsByValue = new Map(
	languageOptions.map((option) => [option.value, option])
);

export function getLanguageOptions() {
	return languageOptions;
}

export function filterLanguageOptions(query: string) {
	const normalizedQuery = query.trim().toLowerCase();

	if (!normalizedQuery) {
		return languageOptions;
	}

	return languageOptions.filter((option) =>
		option.searchText.includes(normalizedQuery)
	);
}

export function normalizeLanguagePickerValue(
	language: string | null | undefined,
	fallback: string | null = "en"
) {
	const primaryLanguage = getPrimaryLanguageTag(language);

	if (primaryLanguage && languageOptionsByValue.has(primaryLanguage)) {
		return primaryLanguage;
	}

	const normalizedLanguage = normalizeLanguageTag(language);

	if (normalizedLanguage && languageOptionsByValue.has(normalizedLanguage)) {
		return normalizedLanguage;
	}

	if (fallback && languageOptionsByValue.has(fallback)) {
		return fallback;
	}

	return null;
}

export function getLanguageOption(language: string | null | undefined) {
	const normalizedLanguage = normalizeLanguagePickerValue(language, null);

	if (!normalizedLanguage) {
		return null;
	}

	return languageOptionsByValue.get(normalizedLanguage) ?? null;
}

export function isValidLanguageTag(
	language: string | null | undefined
): boolean {
	if (!language) {
		return false;
	}

	try {
		new Intl.Locale(language);
		return true;
	} catch {
		return false;
	}
}

export function formatLanguageLabel(language: string | null | undefined) {
	if (!language) {
		return "Unknown";
	}

	try {
		const locale = new Intl.Locale(language);
		const languageName = new Intl.DisplayNames(["en"], {
			type: "language",
		}).of(locale.language);

		if (!languageName) {
			return language;
		}

		if (!locale.region) {
			return languageName;
		}

		const regionName = new Intl.DisplayNames(["en"], {
			type: "region",
		}).of(locale.region);

		return regionName ? `${languageName} (${regionName})` : languageName;
	} catch {
		return language;
	}
}
