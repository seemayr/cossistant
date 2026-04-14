import { describe, expect, it } from "bun:test";
import {
	filterLanguageOptions,
	formatLanguageLabel,
	getLanguageOption,
	getLanguageOptions,
	normalizeLanguagePickerValue,
	POPULAR_LANGUAGE_CODES,
} from "./language";

describe("language helpers", () => {
	it("formats human-readable language labels", () => {
		expect(formatLanguageLabel("en")).toBe("English");
		expect(formatLanguageLabel("en-US")).toBe("English (United States)");
	});

	it("keeps popular languages pinned to the top in the curated order", () => {
		expect(
			getLanguageOptions().slice(0, POPULAR_LANGUAGE_CODES.length)
		).toEqual(
			POPULAR_LANGUAGE_CODES.map((languageCode) => ({
				value: languageCode,
				label: getLanguageOption(languageCode)?.label ?? languageCode,
				isPopular: true,
				searchText:
					`${getLanguageOption(languageCode)?.label ?? languageCode} ${languageCode}`.toLowerCase(),
			}))
		);
	});

	it("filters language options by label and code", () => {
		expect(
			filterLanguageOptions("port").some((option) => option.value === "pt")
		).toBe(true);
		expect(
			filterLanguageOptions("zh").some((option) => option.value === "zh")
		).toBe(true);
	});

	it("normalizes locale-specific values to picker languages", () => {
		expect(normalizeLanguagePickerValue("en-US")).toBe("en");
		expect(normalizeLanguagePickerValue("pt-BR")).toBe("pt");
		expect(getLanguageOption("ja-JP")?.value).toBe("ja");
	});
});
