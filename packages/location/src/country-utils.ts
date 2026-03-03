import { countries as countriesIntl } from "./countries-intl";
import flags from "./country-flags";

type CountryRecord = {
	alpha2: string;
	name: string;
	capital?: string | null;
	emoji?: string | null;
};

type CountryDetailsInput = {
	countryCode?: string | null;
	country?: string | null;
	locale?: string | null;
	timezone?: string | null;
	city?: string | null;
};

type CountryDetails = {
	code: string | null;
	name: string | null;
	flagEmoji: string | null;
};

const COUNTRY_DATA = countriesIntl as CountryRecord[];
const UPPERCASE_TWO_LETTER_REGEX = /^[A-Z]{2}$/;
const LOWERCASE_TWO_LETTER_REGEX = /^[a-z]{2}$/;
const LOCALE_SEPARATOR_REGEX = /[-_]/;

function normalizeKey(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

const CAPITAL_TO_COUNTRY = new Map<string, CountryRecord>();
const NAME_TO_COUNTRY = new Map<string, CountryRecord>();

for (const country of COUNTRY_DATA) {
	if (!country?.alpha2) {
		continue;
	}

	NAME_TO_COUNTRY.set(normalizeKey(country.name), country);

	if (
		typeof country.capital === "string" &&
		country.capital.trim().length > 0
	) {
		CAPITAL_TO_COUNTRY.set(normalizeKey(country.capital), country);
	}
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
	if (!UPPERCASE_TWO_LETTER_REGEX.test(normalizedCode)) {
		return null;
	}
	return normalizedCode;
}

export function getFlagEmoji(code?: string | null): string | null {
	const normalizedCode = normalizeCountryCode(code);
	if (!normalizedCode) {
		return null;
	}

	const flag = flags[normalizedCode as keyof typeof flags]?.emoji;

	if (flag) {
		return flag;
	}

	const country = COUNTRY_DATA.find((entry) => entry.alpha2 === normalizedCode);
	return country?.emoji ?? null;
}

export function inferCountryCodeFromLocale(
	locale?: string | null
): string | null {
	if (!locale) {
		return null;
	}

	try {
		const intlLocale = new Intl.Locale(locale);
		if (intlLocale.region) {
			return normalizeCountryCode(intlLocale.region);
		}
	} catch (_error) {
		// Ignore parsing failures and fall back to manual parsing
	}

	const segments = locale.split(LOCALE_SEPARATOR_REGEX);
	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i];
		if (!seg) {
			continue;
		}
		if (UPPERCASE_TWO_LETTER_REGEX.test(seg)) {
			return seg;
		}
		if (LOWERCASE_TWO_LETTER_REGEX.test(seg)) {
			return seg.toUpperCase();
		}
	}

	return null;
}

function inferCountryCodeFromCity(city?: string | null): string | null {
	if (!city) {
		return null;
	}

	const normalizedCity = normalizeKey(city);
	const directMatch = CAPITAL_TO_COUNTRY.get(normalizedCity);
	if (directMatch) {
		return directMatch.alpha2;
	}

	const nameMatch = NAME_TO_COUNTRY.get(normalizedCity);
	if (nameMatch) {
		return nameMatch.alpha2;
	}

	return null;
}

export function inferCountryCodeFromTimezone(
	timezone?: string | null
): string | null {
	if (!timezone) {
		return null;
	}

	const segments = timezone.split("/");
	const cityCandidate = segments.at(-1);
	if (!cityCandidate) {
		return null;
	}

	return inferCountryCodeFromCity(cityCandidate.replace(/_/g, " "));
}

export function getCountryDisplayName(
	code?: string | null,
	locale?: string | null
): string | null {
	const normalizedCode = normalizeCountryCode(code);
	if (!normalizedCode) {
		return null;
	}

	if (typeof Intl.DisplayNames !== "undefined") {
		try {
			const display = new Intl.DisplayNames(locale ? [locale, "en"] : ["en"], {
				type: "region",
			});
			const name = display.of(normalizedCode);
			if (name) {
				return name;
			}
		} catch (_error) {
			// Ignore failures and fall back to dataset lookup
		}
	}

	const country = COUNTRY_DATA.find((entry) => entry.alpha2 === normalizedCode);
	return country?.name ?? null;
}

export function resolveCountryDetails(
	input: CountryDetailsInput
): CountryDetails {
	const localeCandidate = input.locale ?? null;
	const code =
		normalizeCountryCode(input.countryCode) ??
		inferCountryCodeFromTimezone(input.timezone) ??
		inferCountryCodeFromLocale(localeCandidate) ??
		inferCountryCodeFromCity(input.city);

	let name = input.country ?? null;

	if (!name && code) {
		name = getCountryDisplayName(code, localeCandidate);
	}

	const flagEmoji = getFlagEmoji(code);

	return {
		code: code ?? null,
		name,
		flagEmoji,
	};
}

export type { CountryDetails, CountryDetailsInput };
